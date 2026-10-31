import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { describe, expect, it } from "vitest";
import { AUTH_RATE_LIMIT_RULES, isAuthRateLimitEnabled } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

/**
 * 本番と同じルール・同じ保存先（DB）でレート制限を有効にした Better Auth を作る。
 * （アプリの auth はテスト環境ではレート制限が無効のため）
 */
function createRateLimitedAuth() {
  return betterAuth({
    baseURL: "http://localhost:3000",
    secret: "rate-limit-test-secret-rate-limit-test-secret",
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: { enabled: true, sendResetPassword: async () => {} },
    rateLimit: { enabled: true, storage: "database", customRules: AUTH_RATE_LIMIT_RULES },
  });
}

function post(auth: ReturnType<typeof createRateLimitedAuth>, path: string, body: unknown, ip: string) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

describe("レート制限が有効になる条件", () => {
  it("本番でのみ有効で、明示的に無効化できる", () => {
    expect(isAuthRateLimitEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(isAuthRateLimitEnabled({ NODE_ENV: "production", DISABLE_AUTH_RATE_LIMIT: "true" })).toBe(false);
    expect(isAuthRateLimitEnabled({ NODE_ENV: "production", DISABLE_AUTH_RATE_LIMIT: "false" })).toBe(true);
    expect(isAuthRateLimitEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isAuthRateLimitEnabled({ NODE_ENV: "test" })).toBe(false);
  });

  it("Vercel の Production / Preview では常に有効で、DISABLE_AUTH_RATE_LIMIT でも無効にできない", () => {
    for (const VERCEL_ENV of ["production", "preview"]) {
      expect(isAuthRateLimitEnabled({ VERCEL_ENV, NODE_ENV: "production" })).toBe(true);
      expect(isAuthRateLimitEnabled({ VERCEL_ENV, NODE_ENV: "production", DISABLE_AUTH_RATE_LIMIT: "true" })).toBe(true);
    }
  });
});

describe("認証エンドポイントのレート制限（本番と同じルール）", () => {
  it("ログインは 1 分あたり 10 回を超えると 429（正しいパスワードでも）", async () => {
    const auth = createRateLimitedAuth();
    const user = await createUser();
    const max = AUTH_RATE_LIMIT_RULES["/sign-in/email"].max;

    for (let i = 0; i < max; i++) {
      const res = await post(auth, "/sign-in/email", { email: user.email, password: "wrong-password" }, "203.0.113.1");
      expect(res.status).toBe(401);
    }
    const blocked = await post(auth, "/sign-in/email", { email: user.email, password: TEST_PASSWORD }, "203.0.113.1");
    expect(blocked.status).toBe(429);

    // 制限は IP アドレス単位（別の IP からはログインできる）
    const other = await post(auth, "/sign-in/email", { email: user.email, password: TEST_PASSWORD }, "203.0.113.2");
    expect(other.status).toBe(200);

    // 回数は DB に保存される（サーバーレスの複数インスタンスで共有される）
    expect(await db.rateLimit.count()).toBeGreaterThan(0);
  });

  it("パスワード再設定メールの要求は 5 分あたり 3 回まで", async () => {
    const auth = createRateLimitedAuth();
    const max = AUTH_RATE_LIMIT_RULES["/request-password-reset"].max;
    for (let i = 0; i < max; i++) {
      const res = await post(auth, "/request-password-reset", { email: "a@example.com" }, "198.51.100.1");
      expect(res.status).toBe(200);
    }
    const blocked = await post(auth, "/request-password-reset", { email: "a@example.com" }, "198.51.100.1");
    expect(blocked.status).toBe(429);
  });

  it("ユーザー登録は 1 分あたり 5 回まで", async () => {
    const auth = createRateLimitedAuth();
    const max = AUTH_RATE_LIMIT_RULES["/sign-up/email"].max;
    for (let i = 0; i < max; i++) {
      const res = await post(
        auth,
        "/sign-up/email",
        { name: "u", email: `rl-${i}@example.com`, password: TEST_PASSWORD },
        "192.0.2.1",
      );
      expect(res.status).toBe(200);
    }
    const blocked = await post(
      auth,
      "/sign-up/email",
      { name: "u", email: "rl-blocked@example.com", password: TEST_PASSWORD },
      "192.0.2.1",
    );
    expect(blocked.status).toBe(429);
    expect(await db.user.count({ where: { email: "rl-blocked@example.com" } })).toBe(0);
  });
});
