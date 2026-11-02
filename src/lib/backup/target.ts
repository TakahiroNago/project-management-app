import { isNeonPooledUrl, isPostgresUrl, NEON_ENDPOINT_ID_PATTERN, neonEndpointId } from "../database-url";

type Env = Record<string, string | undefined>;

/** 論理バックアップの取得先（.github/workflows/backup.yml の target） */
export const BACKUP_TARGETS = ["production", "preview"] as const;
export type BackupTarget = (typeof BACKUP_TARGETS)[number];

/** バックアップに使ってはいけないロール（書き込みできる。読み取り専用の backup_reader を使う） */
const WRITABLE_ROLES = ["neondb_owner", "production_app", "preview_app"];

export function isBackupTarget(value: string | undefined): value is BackupTarget {
  return BACKUP_TARGETS.includes(value as BackupTarget);
}

function userName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).username);
  } catch {
    return "";
  }
}

/**
 * バックアップの前に、BACKUP_DATABASE_URL が指定した環境の DB を指しているかを検査する。
 * - Neon の Direct Connection であること（pg_dump の --snapshot はセッションをまたぐため、PgBouncer を経由できない）
 * - production: PRODUCTION_DB_ENDPOINT_ID の DB / preview: それ以外の DB
 * - 書き込みできる既知のロールではないこと（権限そのものは接続後に checkReadOnlyRole で確認する）
 *
 * @returns 問題点の一覧（空なら問題なし）。接続文字列の値は含めない
 */
export function checkBackupTarget(target: string | undefined, env: Env): string[] {
  if (!isBackupTarget(target)) {
    return [`Unknown backup target. Use one of: ${BACKUP_TARGETS.join(", ")}.`];
  }

  const errors: string[] = [];
  const url = env.BACKUP_DATABASE_URL;
  const productionEndpoint = env.PRODUCTION_DB_ENDPOINT_ID;

  if (!url || !isPostgresUrl(url)) {
    errors.push("BACKUP_DATABASE_URL secret is not set (or is not a PostgreSQL connection string) for this environment.");
  } else if (isNeonPooledUrl(url)) {
    errors.push("BACKUP_DATABASE_URL is a pooled connection (-pooler). Use the Neon direct connection string.");
  } else if (neonEndpointId(url) === null) {
    errors.push("BACKUP_DATABASE_URL is not a Neon connection string.");
  } else if (WRITABLE_ROLES.includes(userName(url))) {
    errors.push("BACKUP_DATABASE_URL uses a role that can write. Use the read-only backup role (backup_reader).");
  }
  if (!productionEndpoint || !NEON_ENDPOINT_ID_PATTERN.test(productionEndpoint)) {
    errors.push("PRODUCTION_DB_ENDPOINT_ID variable is not set (ep-...).");
  }
  if (errors.length > 0) return errors;

  const endpoint = neonEndpointId(url!);
  if (target === "production" && endpoint !== productionEndpoint) {
    errors.push("BACKUP_DATABASE_URL does not point to the production branch (PRODUCTION_DB_ENDPOINT_ID).");
  }
  if (target === "preview" && endpoint === productionEndpoint) {
    errors.push("BACKUP_DATABASE_URL points to the production branch. The preview environment must use the preview branch.");
  }
  return errors;
}
