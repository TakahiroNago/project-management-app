import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

/** 統合テストの開始前に、テスト用 DB にマイグレーションを適用する */
export default function setup() {
  loadEnv({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL (tests delete all data).");
  }
  execSync("npx prisma migrate deploy", {
    // DIRECT_URL も上書きする（.env に DIRECT_URL があると、そちらにマイグレーションされてしまうため）
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "inherit",
  });
}
