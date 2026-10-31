import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

/** テスト用 DB にマイグレーションを適用する */
export default function globalSetup() {
  loadEnv({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
  execSync("npx prisma migrate deploy", {
    // DIRECT_URL も上書きする（.env に DIRECT_URL があると、そちらにマイグレーションされてしまうため）
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "inherit",
  });
}
