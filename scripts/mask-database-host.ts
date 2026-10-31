/**
 * DB のホスト名・エンドポイント ID を GitHub Actions のログで伏せ字にする（.github/workflows/migrate.yml）。
 * 公開リポジトリでは Actions のログを誰でも閲覧できるため。以降のステップの出力にも適用される。
 *
 * 環境変数: DIRECT_URL（Secret）、PRODUCTION_DB_ENDPOINT_ID（Variable）
 */
import { databaseLogMasks, NEON_ENDPOINT_ID_PATTERN } from "../src/lib/database-url";

const values = new Set(process.env.DIRECT_URL ? databaseLogMasks(process.env.DIRECT_URL) : []);
const productionEndpoint = process.env.PRODUCTION_DB_ENDPOINT_ID;
if (productionEndpoint && NEON_ENDPOINT_ID_PATTERN.test(productionEndpoint)) {
  values.add(productionEndpoint);
  values.add(`${productionEndpoint}-pooler`);
}

for (const value of values) console.info(`::add-mask::${value}`);
console.info(`Masked ${values.size} value(s).`);
