/**
 * 本番マイグレーション・デプロイの前提条件の検査（.github/workflows/migrate.yml から
 * scripts/release-guard.ts 経由で実行する）。GitHub API の読み取りのみを行う。
 *
 * どの検査も「確認できなかった」場合（API のエラー・想定外の応答・通信失敗）は問題ありとして扱う。
 * 戻り値は問題点の一覧（空なら問題なし）。
 */

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubContext = {
  /** 例: https://api.github.com */
  apiUrl: string;
  /** owner/repo */
  repository: string;
  token: string | undefined;
  fetch: FetchLike;
};

type ApiResult = { ok: true; body: unknown } | { ok: false; error: string };

async function getJson(context: GitHubContext, path: string): Promise<ApiResult> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (context.token) headers.authorization = `Bearer ${context.token}`;
  let response: Response;
  try {
    response = await context.fetch(`${context.apiUrl.replace(/\/$/, "")}/repos/${context.repository}${path}`, { headers });
  } catch (e) {
    return { ok: false, error: `GitHub API request failed (${e instanceof Error ? e.message : "unknown error"}).` };
  }
  if (!response.ok) {
    return { ok: false, error: `GitHub API returned HTTP ${response.status} for ${path}.` };
  }
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, error: `GitHub API returned an invalid JSON response for ${path}.` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Environment に次の保護ルールがあるかを検査する（M2）。
 * - Required reviewers（承認者が 1 人以上）
 * - デプロイ元ブランチの制限（Selected branches で、許可されたブランチが allowedBranch のみ）
 */
export async function checkEnvironmentProtection(
  context: GitHubContext,
  { environment, allowedBranch }: { environment: string; allowedBranch: string },
): Promise<string[]> {
  const env = await getJson(context, `/environments/${encodeURIComponent(environment)}`);
  if (!env.ok) {
    const hint = env.error.includes("HTTP 404") ? " The environment may not exist." : "";
    return [`Could not verify the protection rules of the "${environment}" environment. ${env.error}${hint}`];
  }
  if (!isRecord(env.body)) return [`Unexpected response for the "${environment}" environment.`];

  const errors: string[] = [];
  const rules = Array.isArray(env.body.protection_rules) ? env.body.protection_rules : [];
  const reviewersRule = rules.find((rule) => isRecord(rule) && rule.type === "required_reviewers");
  const reviewers = isRecord(reviewersRule) && Array.isArray(reviewersRule.reviewers) ? reviewersRule.reviewers : [];
  if (reviewers.length === 0) {
    errors.push(`The "${environment}" environment has no required reviewers.`);
  }

  const policy = env.body.deployment_branch_policy;
  if (!isRecord(policy)) {
    errors.push(`The "${environment}" environment has no deployment branch restriction.`);
  } else if (policy.custom_branch_policies !== true) {
    errors.push(
      `The "${environment}" environment must restrict deployment branches to "${allowedBranch}" using "Selected branches and tags".`,
    );
  } else {
    const list = await getJson(
      context,
      `/environments/${encodeURIComponent(environment)}/deployment-branch-policies?per_page=100`,
    );
    if (!list.ok) {
      errors.push(`Could not verify the deployment branch policies. ${list.error}`);
    } else {
      const policies = isRecord(list.body) && Array.isArray(list.body.branch_policies) ? list.body.branch_policies : null;
      const totalCount = isRecord(list.body) ? list.body.total_count : undefined;
      if (policies === null || typeof totalCount !== "number" || totalCount !== policies.length) {
        errors.push("Unexpected response for the deployment branch policies.");
      } else if (policies.length === 0) {
        errors.push(`The "${environment}" environment allows no branches. Add "${allowedBranch}".`);
      } else {
        const onlyAllowedBranch = policies.every(
          (p) => isRecord(p) && p.name === allowedBranch && (p.type === undefined || p.type === "branch"),
        );
        if (!onlyAllowedBranch) {
          errors.push(`The "${environment}" environment must allow deployments only from the "${allowedBranch}" branch.`);
        }
      }
    }
  }
  return errors;
}

/**
 * 実行中のコミット（GITHUB_SHA）が、ブランチの最新コミットと一致するかを検査する（M1）。
 * Deploy Hook はブランチの最新コミットをデプロイするため、一致しないとマイグレーションしていない
 * コミットが本番にデプロイされるおそれがある。
 */
export async function checkCommitIsBranchHead(
  context: GitHubContext,
  { branch, sha }: { branch: string; sha: string | undefined },
): Promise<string[]> {
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return ["GITHUB_SHA is missing or invalid."];
  const ref = await getJson(context, `/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!ref.ok) return [`Could not get the latest commit of "${branch}". ${ref.error}`];
  const headSha = isRecord(ref.body) && isRecord(ref.body.object) ? ref.body.object.sha : undefined;
  if (typeof headSha !== "string" || !/^[0-9a-f]{40}$/.test(headSha)) {
    return [`Unexpected response for the latest commit of "${branch}".`];
  }
  if (headSha !== sha) {
    return [
      `"${branch}" has moved since this run started (run: ${sha.slice(0, 7)}, ${branch}: ${headSha.slice(0, 7)}). ` +
        `Stopped to avoid deploying an unmigrated commit. Re-run the workflow from the latest "${branch}".`,
    ];
  }
  return [];
}
