/**
 * DB のホスト名・エンドポイント ID を GitHub Actions のログで伏せ字にする（.github/workflows/migrate.yml・backup.yml）。
 * 公開リポジトリでは Actions のログを誰でも閲覧できるため。以降のステップの出力にも適用される。
 *
 * 環境変数: DIRECT_URL / BACKUP_DATABASE_URL（Secret。設定されているものだけ）、PRODUCTION_DB_ENDPOINT_ID（Variable）
 */
import { databaseLogMasks, NEON_ENDPOINT_ID_PATTERN } from "../src/lib/database-url";

const urls = [process.env.DIRECT_URL, process.env.BACKUP_DATABASE_URL].filter((url): url is string => Boolean(url));
const values = new Set(urls.flatMap((url) => databaseLogMasks(url)));
const productionEndpoint = process.env.PRODUCTION_DB_ENDPOINT_ID;
if (productionEndpoint && NEON_ENDPOINT_ID_PATTERN.test(productionEndpoint)) {
  values.add(productionEndpoint);
  values.add(`${productionEndpoint}-pooler`);
}

for (const value of values) console.info(`::add-mask::${value}`);
console.info(`Masked ${values.size} value(s).`);
