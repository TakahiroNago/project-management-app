import { describe, expect, it, vi } from "vitest";
import { checkCommitIsBranchHead, checkEnvironmentProtection, type FetchLike, type GitHubContext } from "./release-guards";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const ENV_PATH = "/repos/owner/repo/environments/production";
const POLICIES_PATH = `${ENV_PATH}/deployment-branch-policies?per_page=100`;
const REF_PATH = "/repos/owner/repo/git/ref/heads/main";

type Route = { status?: number; body?: unknown; rawBody?: string; throws?: Error };

/** パスごとに応答を返す fetch。定義されていないパスは 404 */
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn<FetchLike>(async (url) => {
    const path = url.replace("https://api.github.com", "");
    const route = routes[path];
    if (!route) return new Response("{}", { status: 404 });
    if (route.throws) throw route.throws;
    return new Response(route.rawBody ?? JSON.stringify(route.body), { status: route.status ?? 200 });
  });
}

function context(fetch: FetchLike, { withToken = true } = {}): GitHubContext {
  return { apiUrl: "https://api.github.com/", repository: "owner/repo", token: withToken ? "ghs_token" : undefined, fetch };
}

const protectedEnvironment = {
  name: "production",
  protection_rules: [
    { type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "owner" } }] },
    { type: "branch_policy" },
  ],
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
};
const mainOnly = { total_count: 1, branch_policies: [{ name: "main", type: "branch" }] };
const options = { environment: "production", allowedBranch: "main" };

describe("checkEnvironmentProtection（M2）", () => {
  it("承認者がいて、デプロイ元が main のみなら問題なし", async () => {
    const fetch = fakeFetch({ [ENV_PATH]: { body: protectedEnvironment }, [POLICIES_PATH]: { body: mainOnly } });
    expect(await checkEnvironmentProtection(context(fetch), options)).toEqual([]);
    // 読み取り用のトークンを付けて GitHub API を呼ぶ
    expect(fetch.mock.calls[0][1]?.headers?.authorization).toBe("Bearer ghs_token");
  });

  it("type が省略されたブランチのポリシー（古い API の応答）も main なら許可する", async () => {
    const fetch = fakeFetch({
      [ENV_PATH]: { body: protectedEnvironment },
      [POLICIES_PATH]: { body: { total_count: 1, branch_policies: [{ name: "main" }] } },
    });
    expect(await checkEnvironmentProtection(context(fetch), options)).toEqual([]);
  });

  it.each([
    ["Environment が存在しない（404）", { [ENV_PATH]: { status: 404, body: { message: "Not Found" } } }, "may not exist"],
    ["権限不足（403）", { [ENV_PATH]: { status: 403, body: {} } }, "HTTP 403"],
    ["API のエラー（500）", { [ENV_PATH]: { status: 500, body: {} } }, "HTTP 500"],
    ["通信エラー", { [ENV_PATH]: { throws: new Error("ECONNRESET") } }, "request failed"],
    ["JSON でない応答", { [ENV_PATH]: { rawBody: "<html>" } }, "invalid JSON"],
    ["想定外の形の応答", { [ENV_PATH]: { body: null } }, "Unexpected response"],
  ])("%s なら確認できないため停止する", async (_, routes, message) => {
    const errors = await checkEnvironmentProtection(context(fakeFetch(routes)), options);
    expect(errors.join("\n")).toContain(message);
  });

  it.each([
    ["保護ルールが無い（自動作成された Environment）", { protection_rules: [], deployment_branch_policy: null }],
    ["承認者の一覧が空", { protection_rules: [{ type: "required_reviewers", reviewers: [] }] }],
    ["承認者のルールが無い", { protection_rules: [{ type: "wait_timer", wait_timer: 5 }] }],
  ])("%s なら停止する", async (_, override) => {
    const fetch = fakeFetch({ [ENV_PATH]: { body: { ...protectedEnvironment, ...override } }, [POLICIES_PATH]: { body: mainOnly } });
    expect((await checkEnvironmentProtection(context(fetch), options)).join("\n")).toContain("no required reviewers");
  });

  it.each([
    ["デプロイ元ブランチの制限が無い", null, undefined, "no deployment branch restriction"],
    ["Protected branches 方式", { protected_branches: true, custom_branch_policies: false }, undefined, "Selected branches"],
    ["main 以外のブランチも許可", undefined, { total_count: 2, branch_policies: [{ name: "main" }, { name: "develop" }] }, "only from the \"main\""],
    ["ワイルドカードのブランチ", undefined, { total_count: 1, branch_policies: [{ name: "*", type: "branch" }] }, "only from the \"main\""],
    ["main という名前のタグ", undefined, { total_count: 1, branch_policies: [{ name: "main", type: "tag" }] }, "only from the \"main\""],
    ["許可されたブランチが無い", undefined, { total_count: 0, branch_policies: [] }, "allows no branches"],
    ["ページ分割で一部しか取得できない", undefined, { total_count: 101, branch_policies: [{ name: "main" }] }, "Unexpected response"],
  ])("%s なら停止する", async (_, policy, policies, message) => {
    const fetch = fakeFetch({
      [ENV_PATH]: { body: policy === undefined ? protectedEnvironment : { ...protectedEnvironment, deployment_branch_policy: policy } },
      [POLICIES_PATH]: { body: policies ?? mainOnly },
    });
    expect((await checkEnvironmentProtection(context(fetch), options)).join("\n")).toContain(message);
  });

  it("ブランチのポリシーの取得に失敗したら停止する", async () => {
    const fetch = fakeFetch({ [ENV_PATH]: { body: protectedEnvironment }, [POLICIES_PATH]: { status: 500 } });
    expect((await checkEnvironmentProtection(context(fetch), options)).join("\n")).toContain(
      "Could not verify the deployment branch policies",
    );
  });

  it("問題が複数あればすべて報告する", async () => {
    const fetch = fakeFetch({ [ENV_PATH]: { body: { protection_rules: [], deployment_branch_policy: null } } });
    expect(await checkEnvironmentProtection(context(fetch), options)).toHaveLength(2);
  });
});

describe("checkCommitIsBranchHead（M1）", () => {
  const branch = { branch: "main", sha: SHA };

  it("実行中のコミットが main の最新なら問題なし", async () => {
    const fetch = fakeFetch({ [REF_PATH]: { body: { ref: "refs/heads/main", object: { sha: SHA, type: "commit" } } } });
    expect(await checkCommitIsBranchHead(context(fetch), branch)).toEqual([]);
  });

  it("main が進んでいたら停止し、再実行が必要であることを示す", async () => {
    const fetch = fakeFetch({ [REF_PATH]: { body: { object: { sha: OTHER_SHA } } } });
    const message = (await checkCommitIsBranchHead(context(fetch), branch)).join("\n");
    expect(message).toContain("has moved");
    expect(message).toContain("Re-run the workflow");
    expect(message).toContain("aaaaaaa");
    expect(message).toContain("bbbbbbb");
  });

  it.each([
    ["API のエラー（500）", { [REF_PATH]: { status: 500 } }, "HTTP 500"],
    ["ブランチが存在しない（404）", {}, "HTTP 404"],
    ["通信エラー", { [REF_PATH]: { throws: new Error("timeout") } }, "request failed"],
    ["SHA を含まない応答", { [REF_PATH]: { body: { object: {} } } }, "Unexpected response"],
    ["JSON でない応答", { [REF_PATH]: { rawBody: "oops" } }, "invalid JSON"],
  ])("%s なら確認できないため停止する", async (_, routes, message) => {
    expect((await checkCommitIsBranchHead(context(fakeFetch(routes)), branch)).join("\n")).toContain(message);
  });

  it.each([undefined, "", "not-a-sha"])("GITHUB_SHA が不正（%s）なら API を呼ばずに停止する", async (sha) => {
    const fetch = fakeFetch({});
    expect(await checkCommitIsBranchHead(context(fetch), { branch: "main", sha })).toEqual(["GITHUB_SHA is missing or invalid."]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("トークンが無くても呼び出せる（公開リポジトリ）が、Authorization は付けない", async () => {
    const fetch = fakeFetch({ [REF_PATH]: { body: { object: { sha: SHA } } } });
    expect(await checkCommitIsBranchHead(context(fetch, { withToken: false }), branch)).toEqual([]);
    expect(fetch.mock.calls[0][1]?.headers?.authorization).toBeUndefined();
  });
});
