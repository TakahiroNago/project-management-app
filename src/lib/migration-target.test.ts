import { describe, expect, it } from "vitest";
import { checkMigrationTarget } from "./migration-target";

const PROD = "ep-prod-main-111111";
const PREVIEW = "ep-preview-dev-222222";
const direct = (endpoint: string, password = "pw") =>
  `postgresql://owner:${password}@${endpoint}.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const pooled = (endpoint: string) => `postgresql://owner:pw@${endpoint}-pooler.ap-southeast-1.aws.neon.tech/neondb`;

describe("checkMigrationTarget", () => {
  it("production は本番ブランチの Direct Connection のみ許可する", () => {
    expect(checkMigrationTarget("production", { DIRECT_URL: direct(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD })).toEqual([]);
    expect(
      checkMigrationTarget("production", { DIRECT_URL: direct(PREVIEW), PRODUCTION_DB_ENDPOINT_ID: PROD }).join(),
    ).toContain("does not point to the production branch");
  });

  it("preview は本番ブランチ以外の Direct Connection のみ許可する", () => {
    expect(checkMigrationTarget("preview", { DIRECT_URL: direct(PREVIEW), PRODUCTION_DB_ENDPOINT_ID: PROD })).toEqual([]);
    expect(checkMigrationTarget("preview", { DIRECT_URL: direct(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD }).join()).toContain(
      "points to the production branch",
    );
  });

  it.each([
    ["DIRECT_URL が未設定", { PRODUCTION_DB_ENDPOINT_ID: PROD }, "DIRECT_URL secret is not set"],
    ["Pooled Connection", { DIRECT_URL: pooled(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD }, "pooled connection"],
    ["Neon 以外", { DIRECT_URL: "postgresql://u:p@db.example.com/app", PRODUCTION_DB_ENDPOINT_ID: PROD }, "not a Neon"],
    ["エンドポイント ID が未設定", { DIRECT_URL: direct(PROD) }, "PRODUCTION_DB_ENDPOINT_ID"],
  ])("%s ならエラーにする", (_, env, message) => {
    expect(checkMigrationTarget("production", env).join()).toContain(message);
  });

  it("不明な環境名はエラーにする", () => {
    expect(checkMigrationTarget("staging", { DIRECT_URL: direct(PROD), PRODUCTION_DB_ENDPOINT_ID: PROD })).toHaveLength(1);
    expect(checkMigrationTarget(undefined, {})).toHaveLength(1);
  });

  it("エラーメッセージに接続文字列の値を含めない", () => {
    const errors = checkMigrationTarget("preview", { DIRECT_URL: direct(PROD, "TOP-SECRET-PW"), PRODUCTION_DB_ENDPOINT_ID: PROD });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join()).not.toContain("TOP-SECRET-PW");
  });
});
