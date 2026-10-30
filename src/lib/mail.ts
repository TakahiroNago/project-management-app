import "server-only";
import { Resend } from "resend";

type PasswordResetMail = {
  to: string;
  name: string;
  url: string;
};

const isProduction = process.env.NODE_ENV === "production";

/**
 * パスワード再設定メールを送信する。
 *
 * - 本番: Resend で送信。リセット URL・トークンはログに出さない。
 * - 開発・テスト: RESEND_API_KEY が未設定ならコンソールに URL を出力する。
 * - 送信失敗は例外にせずログのみ（呼び出し元はレスポンス返却後に実行しており、
 *   失敗を利用者に伝えるとメールアドレスの登録有無が推測できてしまうため）。
 *
 * @returns 送信（または開発用出力）に成功したか
 */
export async function sendPasswordResetEmail({ to, name, url }: PasswordResetMail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    if (isProduction) {
      console.error("[mail] RESEND_API_KEY / MAIL_FROM is not configured. Password reset email was not sent.");
      return false;
    }
    console.info(`[mail:dev] Password reset link for ${to}: ${url}`);
    return true;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "【ProjectFlow】パスワード再設定のご案内",
      text: [
        `${name} 様`,
        "",
        "パスワード再設定のリクエストを受け付けました。",
        "以下のリンクから30分以内に新しいパスワードを設定してください。",
        "",
        url,
        "",
        "このメールに心当たりがない場合は、破棄してください。パスワードは変更されません。",
      ].join("\n"),
    });
    if (error) {
      // error にはリクエスト内容（URL）は含まれないが、念のため名前とメッセージのみ記録する
      console.error("[mail] Failed to send password reset email:", error.name, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] Failed to send password reset email:", e instanceof Error ? e.message : "unknown error");
    return false;
  }
}
