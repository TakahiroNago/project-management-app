import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { todayInTimeZone } from "@/domain/dates";
import { DEMO_EMAIL_DOMAIN } from "@/domain/demo";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/features/auth/schemas";
import { resolveAuthOrigins } from "@/lib/auth/origins";
import { checkUserInput, USER_INPUT_PATHS } from "@/lib/auth/user-input";
import { runInBackground } from "@/lib/background";
import { db } from "@/lib/db";
import { getDeploymentEnv } from "@/lib/env";
import { checkDemoAvailability, createDemoWorkspace } from "@/features/demo/service";
import { APP_TIME_ZONE } from "@/i18n";
import { sendPasswordResetEmail } from "@/lib/mail";

/** パスワード再設定トークンの有効期限（秒） */
export const RESET_PASSWORD_TOKEN_EXPIRES_IN = 60 * 30;

/** 認証エンドポイントごとのレート制限（window 秒あたり max 回。IP アドレス単位） */
export const AUTH_RATE_LIMIT_RULES = {
  "/sign-in/email": { window: 60, max: 10 },
  "/sign-up/email": { window: 60, max: 5 },
  "/request-password-reset": { window: 60 * 5, max: 3 },
  "/reset-password": { window: 60 * 5, max: 10 },
  "/change-password": { window: 60, max: 5 },
  // デモの開始（サンプルデータを作るため、他より厳しくする）
  "/sign-in/anonymous": { window: 60 * 60, max: 3 },
};

/** デモの開始（Better Auth の anonymous プラグイン）のパス */
const DEMO_SIGN_IN_PATH = "/sign-in/anonymous";

/**
 * レート制限を有効にするか。
 * - Vercel の Production / Preview: 常に有効（DISABLE_AUTH_RATE_LIMIT は無視し、起動時の検証でも拒否する）
 * - それ以外: 本番ビルド（next start）でのみ有効。E2E テスト（短時間に多数のユーザーを登録する）でのみ
 *   DISABLE_AUTH_RATE_LIMIT=true で無効化する
 */
export function isAuthRateLimitEnabled(env: Record<string, string | undefined>) {
  if (getDeploymentEnv(env) !== "local") return true;
  return env.NODE_ENV === "production" && env.DISABLE_AUTH_RATE_LIMIT !== "true";
}

const { baseURL, trustedOrigins } = resolveAuthOrigins(process.env);

export const auth = betterAuth({
  appName: "ProjectFlow",
  baseURL,
  trustedOrigins,
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    autoSignIn: true,
    // トークンは使い捨て（使用時に削除される）。有効期限は 30 分
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN,
    // パスワード再設定時、既存のすべてのセッションを無効化する
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // デモのユーザーのメールアドレス（.invalid）には送らない
      if (user.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) return;
      await sendPasswordResetEmail({ to: user.email, name: user.name, url });
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 日
    updateAge: 60 * 60 * 24, // 1 日ごとに有効期限を延長
  },

  // 総当たり攻撃対策。サーバーレスでもインスタンス間で共有できるよう DB に保存する
  rateLimit: {
    enabled: isAuthRateLimitEnabled(process.env),
    storage: "database",
    customRules: AUTH_RATE_LIMIT_RULES,
  },

  // 名前などの入力を、画面のフォームと同じ規則でサーバー側でも検証する（API を直接呼ばれた場合に備える）
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === DEMO_SIGN_IN_PATH) {
        const availability = await checkDemoAvailability();
        if (availability !== "ok") {
          if (availability === "not-configured") console.error("[demo] CRON_SECRET is not set; the demo is disabled.");
          throw new APIError("SERVICE_UNAVAILABLE", { message: "The demo is not available now.", code: "DEMO_UNAVAILABLE" });
        }
        return;
      }
      const result = checkUserInput(ctx.path, ctx.body);
      if (!result.ok) throw new APIError("BAD_REQUEST", { message: result.message, code: "INVALID_USER_INPUT" });
      if ((USER_INPUT_PATHS as readonly string[]).includes(ctx.path)) return { context: { body: result.body } };
    }),
    // デモのユーザーを作成した直後に、サンプルデータを作る。失敗したらユーザーごと削除してエラーにする
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== DEMO_SIGN_IN_PATH) return;
      const userId = ctx.context.newSession?.user.id;
      if (!userId) return;
      try {
        await createDemoWorkspace(userId, todayInTimeZone(APP_TIME_ZONE));
      } catch (error) {
        console.error("[demo] Failed to create the sample data:", error);
        await db.user.delete({ where: { id: userId } }).catch(() => {});
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to start the demo.", code: "DEMO_SETUP_FAILED" });
      }
    }),
  },

  advanced: {
    // Origin 検証（CSRF・オープンリダイレクト対策）を常に有効にする。
    // 既定ではテスト環境で無効になるため、本番と同じ挙動をテストできるよう明示する
    disableOriginCheck: false,
    // メール送信はレスポンス返却後に実行する（応答時間差によるユーザー列挙を防ぐ）
    backgroundTasks: { handler: runInBackground },
  },

  // Server Action から auth.api を呼んだ際に Cookie を設定するため（plugins の最後に置く）
  plugins: [
    // デモ（お試し）: 訪問者ごとに一時的なユーザーを作る。パスワードを持たないため、パスワードでのログイン・変更はできない。
    // 削除は定期処理（src/app/api/cron/demo-cleanup）で行う。プラグインによる削除（別アカウントでのログイン時の自動削除・
    // /delete-anonymous-user）は、Owner のプロジェクトを残したまま削除しようとして DB の制約で失敗するため無効にする
    anonymous({
      emailDomainName: DEMO_EMAIL_DOMAIN,
      generateName: () => "ゲスト",
      disableDeleteAnonymousUser: true,
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
