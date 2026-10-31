import { isNeonPooledUrl, isPostgresUrl, NEON_ENDPOINT_ID_PATTERN, neonEndpointId } from "./database-url";

type Env = Record<string, string | undefined>;

export const MIGRATION_TARGETS = ["production", "preview"] as const;

/**
 * GitHub Actions でのマイグレーション前に、DIRECT_URL が指定した環境の DB を指しているかを検査する。
 * - Direct Connection（-pooler でない）の Neon の接続文字列であること
 * - production: PRODUCTION_DB_ENDPOINT_ID の DB であること
 * - preview: PRODUCTION_DB_ENDPOINT_ID の DB ではないこと（Preview 用の Secret に本番の URL が入っている誤設定を防ぐ）
 *
 * @returns 問題点の一覧（空なら問題なし）。値は含めない
 */
export function checkMigrationTarget(target: string | undefined, env: Env): string[] {
  if (!MIGRATION_TARGETS.includes(target as (typeof MIGRATION_TARGETS)[number])) {
    return [`Unknown migration target. Use one of: ${MIGRATION_TARGETS.join(", ")}.`];
  }

  const errors: string[] = [];
  const directUrl = env.DIRECT_URL;
  const productionEndpoint = env.PRODUCTION_DB_ENDPOINT_ID;

  if (!directUrl || !isPostgresUrl(directUrl)) {
    errors.push("DIRECT_URL secret is not set (or is not a PostgreSQL connection string) for this environment.");
  } else if (isNeonPooledUrl(directUrl)) {
    errors.push("DIRECT_URL is a pooled connection (-pooler). Use the Neon direct connection string.");
  } else if (neonEndpointId(directUrl) === null) {
    errors.push("DIRECT_URL is not a Neon connection string.");
  }
  if (!productionEndpoint || !NEON_ENDPOINT_ID_PATTERN.test(productionEndpoint)) {
    errors.push("PRODUCTION_DB_ENDPOINT_ID variable is not set (ep-...).");
  }
  if (errors.length > 0) return errors;

  const endpoint = neonEndpointId(directUrl!);
  if (target === "production" && endpoint !== productionEndpoint) {
    errors.push("DIRECT_URL does not point to the production branch (PRODUCTION_DB_ENDPOINT_ID).");
  }
  if (target === "preview" && endpoint === productionEndpoint) {
    errors.push("DIRECT_URL points to the production branch. The preview environment must use the preview branch.");
  }
  return errors;
}
