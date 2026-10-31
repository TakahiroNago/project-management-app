import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveMigrationUrl } from "./prisma/migration-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Prisma CLI 用の接続先。アプリ本体は src/lib/db.ts で DATABASE_URL（Pooled Connection）に接続する。
  // 本番・Preview のマイグレーションは DIRECT_URL（Direct Connection）でのみ実行できる。
  // リモートの DB への migrate dev / migrate reset / db push は拒否する（詳細は migration-url.ts）。
  // 未設定でも prisma generate は動くよう、env()（未設定で例外）は使わない
  datasource: {
    url: resolveMigrationUrl(process.env, process.argv),
  },
});
