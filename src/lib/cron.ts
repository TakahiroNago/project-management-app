import { createHash, timingSafeEqual } from "node:crypto";

/** CRON_SECRET の最小の長さ */
export const CRON_SECRET_MIN_LENGTH = 32;

/**
 * Vercel Cron からのリクエストか。Vercel は環境変数 CRON_SECRET を `Authorization: Bearer <CRON_SECRET>` として送る。
 * CRON_SECRET が未設定・短すぎる場合は常に拒否する。比較は長さによらず一定時間で行う（ハッシュ同士を比較）。
 */
export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH || !authorization) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, actual);
}
