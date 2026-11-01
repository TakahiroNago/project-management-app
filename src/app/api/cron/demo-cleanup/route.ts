import { cleanupExpiredDemoUsers } from "@/features/demo/service";
import { isAuthorizedCronRequest } from "@/lib/cron";

/**
 * 期限切れのデモのユーザーを削除する定期処理（Vercel Cron が 1 日 1 回呼ぶ。vercel.json の crons）。
 * Vercel が送る `Authorization: Bearer <CRON_SECRET>` を検証し、一致しなければ 401。
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await cleanupExpiredDemoUsers();
  console.info(`[demo] Deleted ${result.deletedUsers} expired demo users and ${result.deletedProjects} projects.`);
  return Response.json(result);
}
