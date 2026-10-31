/**
 * 本番マイグレーション・デプロイの前提条件を検査する（.github/workflows/migrate.yml から実行）。
 *
 *   npx tsx scripts/release-guard.ts environment-protection   # production Environment の保護ルール（M2）
 *   npx tsx scripts/release-guard.ts commit-is-head           # 実行中のコミットが main の最新か（M1）
 *
 * 環境変数: GITHUB_REPOSITORY / GITHUB_SHA / GITHUB_API_URL（Actions が設定）、GITHUB_TOKEN（読み取り専用）
 * 問題がある・確認できない場合は終了コード 1 で停止する。
 */
import { checkCommitIsBranchHead, checkEnvironmentProtection, type GitHubContext } from "../src/lib/release-guards";

const PRODUCTION_ENVIRONMENT = "production";
const RELEASE_BRANCH = "main";

async function main(): Promise<string[]> {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) return ["GITHUB_REPOSITORY is not set."];
  const context: GitHubContext = {
    apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    repository,
    token: process.env.GITHUB_TOKEN,
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }),
  };

  switch (process.argv[2]) {
    case "environment-protection":
      return checkEnvironmentProtection(context, { environment: PRODUCTION_ENVIRONMENT, allowedBranch: RELEASE_BRANCH });
    case "commit-is-head":
      return checkCommitIsBranchHead(context, { branch: RELEASE_BRANCH, sha: process.env.GITHUB_SHA });
    default:
      return ["Unknown check. Use one of: environment-protection, commit-is-head."];
  }
}

main()
  .catch((e: unknown) => [`Unexpected error: ${e instanceof Error ? e.message : "unknown error"}`])
  .then((errors) => {
    if (errors.length > 0) {
      for (const error of errors) console.error(`::error::${error}`);
      process.exit(1);
    }
    console.info(`Release guard passed (${process.argv[2]}).`);
  });
