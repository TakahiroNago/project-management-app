/**
 * マイグレーション前に接続先を検査する（.github/workflows/migrate.yml から実行）。
 *
 *   npx tsx scripts/check-migration-target.ts <production|preview>
 *
 * 必要な環境変数: DIRECT_URL（GitHub Environment の Secret）、PRODUCTION_DB_ENDPOINT_ID（Variable）
 * 接続文字列の値はログに出さない。
 */
import { checkMigrationTarget } from "../src/lib/migration-target";

const target = process.argv[2];
const errors = checkMigrationTarget(target, process.env);

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
console.info(`Migration target check passed (${target}).`);
