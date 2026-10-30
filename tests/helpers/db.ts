import { db } from "@/lib/db";

/** テスト用 DB の全データを削除する（トリガーは TRUNCATE では発火しない） */
export async function resetDatabase() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "activity_logs", "comments", "tasks", "project_members", "projects",
      "sessions", "accounts", "verifications", "rate_limits", "users"
    RESTART IDENTITY CASCADE
  `);
}
