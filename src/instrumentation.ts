/**
 * サーバー起動時に 1 回だけ実行される（完了するまでリクエストを受け付けない）。
 * Vercel の Production / Preview で必須の環境変数が不足・誤設定なら例外を投げ、起動させない。
 * 検証内容は src/lib/env.ts を参照。
 */
export async function register() {
  const { assertServerEnv } = await import("@/lib/env");
  assertServerEnv(process.env);
}
