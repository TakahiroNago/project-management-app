import { m } from "@/i18n";

type AuthClientError = { status?: number; code?: string; message?: string };

/** Better Auth クライアントのエラーを表示用メッセージに変換する */
export function authErrorMessage(error: AuthClientError, fallback: string = m.errors.unexpected) {
  if (error.status === 429) return m.auth.tooManyRequests;
  switch (error.code) {
    // Origin の検証で拒否された。ログイン画面でも「メールアドレスまたはパスワードが違う」と誤解させないよう、個別に表示する
    case "INVALID_ORIGIN":
    case "MISSING_OR_NULL_ORIGIN":
      return m.auth.invalidOrigin;
    case "INVALID_EMAIL_OR_PASSWORD":
      return m.auth.login.failed;
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return m.auth.register.emailTaken;
    case "INVALID_PASSWORD":
      return m.settings.password.wrongCurrent;
    case "INVALID_TOKEN":
      return m.auth.resetPassword.invalidToken;
    default:
      return fallback;
  }
}
