import { describe, expect, it } from "vitest";
import { assertServerEnv, checkDatabaseIsolation, getDeploymentEnv, validateServerEnv } from "./env";

const PROD_ENDPOINT = "ep-prod-main-111111";
const PREVIEW_ENDPOINT = "ep-preview-dev-222222";
const pooled = (endpoint: string, password = "s3cret-password") =>
  `postgresql://app:${password}@${endpoint}-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const direct = (endpoint: string) => `postgresql://app:pw@${endpoint}.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`;
const SECRET = "x".repeat(32);

const productionEnv = {
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  DATABASE_URL: pooled(PROD_ENDPOINT),
  PRODUCTION_DB_ENDPOINT_ID: PROD_ENDPOINT,
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "https://projects.art-full-stack.com",
  RESEND_API_KEY: "re_live_key",
  MAIL_FROM: "ProjectFlow <no-reply@mail.art-full-stack.com>",
};

const previewEnv = {
  VERCEL_ENV: "preview",
  NODE_ENV: "production",
  DATABASE_URL: pooled(PREVIEW_ENDPOINT),
  PRODUCTION_DB_ENDPOINT_ID: PROD_ENDPOINT,
  BETTER_AUTH_SECRET: SECRET,
  VERCEL_URL: "projectflow-abc123-team.vercel.app",
};

describe("getDeploymentEnv", () => {
  it("VERCEL_ENV で判定し、Vercel 以外は local", () => {
    expect(getDeploymentEnv({ VERCEL_ENV: "production" })).toBe("production");
    expect(getDeploymentEnv({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(getDeploymentEnv({ VERCEL_ENV: "development" })).toBe("local");
    expect(getDeploymentEnv({ NODE_ENV: "production" })).toBe("local");
  });

  it("Vercel 上（VERCEL=1）で VERCEL_ENV が想定外・未設定なら、本番扱いにせず preview として扱う（R4）", () => {
    expect(getDeploymentEnv({ VERCEL: "1", VERCEL_ENV: "staging" })).toBe("preview");
    expect(getDeploymentEnv({ VERCEL: "1", VERCEL_ENV: "development" })).toBe("preview");
    expect(getDeploymentEnv({ VERCEL: "1", VERCEL_ENV: "Production" })).toBe("preview");
    expect(getDeploymentEnv({ VERCEL: "1" })).toBe("preview");
    expect(getDeploymentEnv({ VERCEL: "1", VERCEL_ENV: "production" })).toBe("production");
  });
});

describe("環境を判定できない本番ビルド（R4）", () => {
  it("Vercel の外で本番ビルドがリモートの DB に接続しようとしたら拒否する", () => {
    const env = { NODE_ENV: "production", DATABASE_URL: pooled(PROD_ENDPOINT) };
    expect(checkDatabaseIsolation(env).join()).toContain("Cannot determine the deployment environment");
    expect(validateServerEnv(env).join()).toContain("Cannot determine the deployment environment");
  });

  it("ローカルの DB を使う本番ビルド（E2E・CI）と、開発サーバーは許可する", () => {
    expect(validateServerEnv({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@localhost:5433/db" })).toEqual([]);
    expect(validateServerEnv({ NODE_ENV: "development", DATABASE_URL: pooled(PREVIEW_ENDPOINT) })).toEqual([]);
    expect(validateServerEnv({ NODE_ENV: "test", DATABASE_URL: pooled(PREVIEW_ENDPOINT) })).toEqual([]);
  });

  it("想定外の VERCEL_ENV では preview の検証が適用され、本番 DB には接続できない", () => {
    const errors = validateServerEnv({ ...previewEnv, VERCEL: "1", VERCEL_ENV: "staging", DATABASE_URL: pooled(PROD_ENDPOINT) });
    expect(errors.join()).toContain("production database");
  });
});

describe("validateServerEnv", () => {
  it("local（開発・テスト・CI）では検証しない", () => {
    expect(validateServerEnv({ NODE_ENV: "production" })).toEqual([]);
  });

  it("本番の設定がそろっていれば問題なし", () => {
    expect(validateServerEnv(productionEnv)).toEqual([]);
    expect(validateServerEnv({ ...productionEnv, BETTER_AUTH_URL: "https://projects.art-full-stack.com/" })).toEqual([]);
  });

  it.each([
    ["BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: undefined }],
    ["BETTER_AUTH_SECRET", { BETTER_AUTH_SECRET: "short" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: undefined }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "http://projects.art-full-stack.com" }],
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "https://projects.art-full-stack.com/app" }],
    ["RESEND_API_KEY", { RESEND_API_KEY: "" }],
    ["MAIL_FROM", { MAIL_FROM: undefined }],
    ["DATABASE_URL", { DATABASE_URL: undefined }],
    ["DATABASE_URL", { DATABASE_URL: direct(PROD_ENDPOINT) }],
    ["DATABASE_URL", { DATABASE_URL: pooled(PREVIEW_ENDPOINT) }],
    ["PRODUCTION_DB_ENDPOINT_ID", { PRODUCTION_DB_ENDPOINT_ID: undefined }],
    ["DISABLE_AUTH_RATE_LIMIT", { DISABLE_AUTH_RATE_LIMIT: "true" }],
  ])("本番で %s が不足・誤設定ならエラーにする", (name, override) => {
    const errors = validateServerEnv({ ...productionEnv, ...override });
    expect(errors.join("\n")).toContain(name);
  });

  it("Preview の設定がそろっていれば問題なし（メール設定は任意）", () => {
    expect(validateServerEnv(previewEnv)).toEqual([]);
  });

  it("Preview で本番 DB を指していたらエラーにする", () => {
    const errors = validateServerEnv({ ...previewEnv, DATABASE_URL: pooled(PROD_ENDPOINT) });
    expect(errors.join("\n")).toContain("production database");
  });

  it.each([
    ["BETTER_AUTH_URL", { BETTER_AUTH_URL: "https://projects.art-full-stack.com" }],
    ["VERCEL_URL", { VERCEL_URL: undefined }],
    ["MAIL_FROM", { RESEND_API_KEY: "re_preview_key" }],
    ["DISABLE_AUTH_RATE_LIMIT", { DISABLE_AUTH_RATE_LIMIT: "true" }],
  ])("Preview で %s の設定に問題があればエラーにする", (name, override) => {
    expect(validateServerEnv({ ...previewEnv, ...override }).join("\n")).toContain(name);
  });

  it("エラーメッセージに接続文字列や秘密情報の値を含めない", () => {
    const errors = validateServerEnv({
      ...previewEnv,
      DATABASE_URL: pooled(PROD_ENDPOINT, "TOP-SECRET-PW"),
      BETTER_AUTH_SECRET: "tiny-secret",
    });
    const message = errors.join("\n");
    expect(errors.length).toBeGreaterThan(0);
    expect(message).not.toContain("TOP-SECRET-PW");
    expect(message).not.toContain("tiny-secret");
    expect(message).not.toContain(PROD_ENDPOINT);
  });
});

describe("checkDatabaseIsolation", () => {
  it("local でローカルの DB なら問題なし", () => {
    expect(checkDatabaseIsolation({ DATABASE_URL: "postgresql://u:p@localhost/db" })).toEqual([]);
  });
});

describe("assertServerEnv", () => {
  it("問題があれば変数名を含めて例外を投げる", () => {
    expect(() => assertServerEnv({ ...productionEnv, RESEND_API_KEY: undefined })).toThrow(/production deployment[\s\S]*RESEND_API_KEY/);
    expect(() => assertServerEnv(productionEnv)).not.toThrow();
  });
});
