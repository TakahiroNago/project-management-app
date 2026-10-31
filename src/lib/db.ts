import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { checkDatabaseIsolation } from "@/lib/env";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // 起動時の検証（instrumentation.ts）に加え、接続を作る直前にも Preview から本番 DB への接続を拒否する
  const isolationErrors = checkDatabaseIsolation(process.env);
  if (isolationErrors.length > 0) {
    throw new Error(`Refusing to connect to the database:\n- ${isolationErrors.join("\n- ")}`);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// 開発時のホットリロードで接続が増え続けないよう、グローバルに 1 インスタンスだけ保持する
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/** db 本体と、$transaction 内のトランザクションクライアントの両方を受け取れる型 */
export type DbClient = Omit<
  typeof db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
