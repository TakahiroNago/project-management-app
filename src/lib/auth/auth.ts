import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/features/auth/schemas";
import { runInBackground } from "@/lib/background";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mail";

/** パスワード再設定トークンの有効期限（秒） */
export const RESET_PASSWORD_TOKEN_EXPIRES_IN = 60 * 30;

export const auth = betterAuth({
  appName: "ProjectFlow",
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
      await sendPasswordResetEmail({ to: user.email, name: user.name, url });
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 日
    updateAge: 60 * 60 * 24, // 1 日ごとに有効期限を延長
  },

  // 総当たり攻撃対策。サーバーレスでもインスタンス間で共有できるよう DB に保存する。
  // 本番ビルドでのみ有効。E2E テスト（短時間に多数のユーザーを登録する）でのみ
  // DISABLE_AUTH_RATE_LIMIT=true で無効化する（本番環境には設定しないこと）
  rateLimit: {
    enabled:
      process.env.NODE_ENV === "production" && process.env.DISABLE_AUTH_RATE_LIMIT !== "true",
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60 * 5, max: 3 },
      "/reset-password": { window: 60 * 5, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },

  advanced: {
    // Origin 検証（CSRF・オープンリダイレクト対策）を常に有効にする。
    // 既定ではテスト環境で無効になるため、本番と同じ挙動をテストできるよう明示する
    disableOriginCheck: false,
    // メール送信はレスポンス返却後に実行する（応答時間差によるユーザー列挙を防ぐ）
    backgroundTasks: { handler: runInBackground },
  },

  // Server Action から auth.api を呼んだ際に Cookie を設定するため（plugins の最後に置く）
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
