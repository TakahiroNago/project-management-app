import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ quiet: true });

/** E2E 用 DB に直接問い合わせる（メールの代わりにパスワード再設定トークンを取り出すため） */
export async function queryTestDb<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

/** 最後に発行されたパスワード再設定トークン（メールのリンクに含まれる値） */
export async function latestResetToken(email: string): Promise<string> {
  const rows = await queryTestDb<{ identifier: string }>(
    `SELECT v."identifier" FROM "verifications" v
       JOIN "users" u ON u."id" = v."value"
      WHERE u."email" = $1 AND v."identifier" LIKE 'reset-password:%'
      ORDER BY v."createdAt" DESC LIMIT 1`,
    [email],
  );
  if (!rows[0]) throw new Error(`No reset token for ${email}`);
  return rows[0].identifier.slice("reset-password:".length);
}
