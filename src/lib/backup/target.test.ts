import { describe, expect, it } from "vitest";
import { checkBackupTarget } from "./target";

const PROD = "ep-prod-main-111111";
const PREVIEW = "ep-preview-dev-222222";
const direct = (endpoint: string, user = "backup_reader") =>
  `postgresql://${user}:secret-pw@${endpoint}.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const pooled = (endpoint: string) => `postgresql://backup_reader:pw@${endpoint}-pooler.ap-southeast-1.aws.neon.tech/neondb`;

describe("checkBackupTarget", () => {
  it("production は本番ブランチの Direct Connection のみ許可する", () => {
    expect(checkBackupTarget("production", { BACKUP_DATABASE_URL: direct(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD })).toEqual([]);
    expect(
      checkBackupTarget("production", { BACKUP_DATABASE_URL: direct(PREVIEW), PRODUCTION_DB_ENDPOINT_ID: PROD }).join(),
    ).toContain("does not point to the production branch");
  });

  it("preview は本番ブランチ以外の Direct Connection のみ許可する", () => {
    expect(checkBackupTarget("preview", { BACKUP_DATABASE_URL: direct(PREVIEW), PRODUCTION_DB_ENDPOINT_ID: PROD })).toEqual([]);
    expect(checkBackupTarget("preview", { BACKUP_DATABASE_URL: direct(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD }).join()).toContain(
      "points to the production branch",
    );
  });

  it.each(["neondb_owner", "production_app", "preview_app"])("書き込みできるロール（%s）は拒否する", (user) => {
    const errors = checkBackupTarget("production", { BACKUP_DATABASE_URL: direct(PROD, user), PRODUCTION_DB_ENDPOINT_ID: PROD });
    expect(errors.join()).toContain("role that can write");
  });

  it.each([
    ["BACKUP_DATABASE_URL が未設定", { PRODUCTION_DB_ENDPOINT_ID: PROD }, "BACKUP_DATABASE_URL secret is not set"],
    ["Pooled Connection", { BACKUP_DATABASE_URL: pooled(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD }, "pooled connection"],
    ["Neon 以外", { BACKUP_DATABASE_URL: "postgresql://u:p@db.example.com/app", PRODUCTION_DB_ENDPOINT_ID: PROD }, "not a Neon"],
    ["エンドポイント ID が未設定", { BACKUP_DATABASE_URL: direct(PROD) }, "PRODUCTION_DB_ENDPOINT_ID"],
  ])("%s ならエラーにする", (_, env, message) => {
    expect(checkBackupTarget("production", env).join()).toContain(message);
  });

  it("未知の target は拒否する（local はワークフローでは使えない）", () => {
    for (const target of [undefined, "", "local", "staging"]) {
      expect(checkBackupTarget(target, { BACKUP_DATABASE_URL: direct(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD }).join()).toContain(
        "Unknown backup target",
      );
    }
  });

  it("エラーメッセージに接続文字列（パスワード・ホスト名）を含めない", () => {
    const envs = [
      { BACKUP_DATABASE_URL: direct(PREVIEW), PRODUCTION_DB_ENDPOINT_ID: PROD },
      { BACKUP_DATABASE_URL: direct(PROD, "neondb_owner"), PRODUCTION_DB_ENDPOINT_ID: PROD },
    ];
    for (const env of envs) {
      const message = checkBackupTarget("production", env).join();
      expect(message).not.toContain("secret-pw");
      expect(message).not.toContain("neon.tech");
    }
  });
});
