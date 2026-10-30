import "server-only";
import { after } from "next/server";

/**
 * レスポンス返却後に処理を実行する（サーバーレス環境でも処理が打ち切られない）。
 * メール送信をレスポンスと切り離すことで、応答時間の差からユーザーの存在を推測されるのを防ぐ。
 */
export function runInBackground(task: Promise<unknown>): void {
  after(task);
}
