/**
 * データベース接続文字列の判定。アプリ（src/lib/env.ts）と Prisma CLI（prisma.config.ts）の両方から使うため、
 * パスエイリアスや外部パッケージに依存しない純粋関数だけを置く。
 * 戻り値・エラーメッセージに接続文字列（パスワード）を含めないこと。
 */

function parseHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") return null;
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** PostgreSQL の接続文字列として解釈できるか */
export function isPostgresUrl(url: string): boolean {
  return parseHostname(url) !== null;
}

/** Neon の Pooled Connection（PgBouncer 経由。ホスト名が ep-xxx-pooler.…）か */
export function isNeonPooledUrl(url: string): boolean {
  const hostname = parseHostname(url);
  return hostname !== null && /^ep-[a-z0-9-]+-pooler\./.test(hostname);
}

/**
 * Neon のエンドポイント ID（ep-xxx）。Pooled / Direct のどちらでも同じ値を返す。
 * Neon のホストでなければ null。
 */
export function neonEndpointId(url: string): string | null {
  const hostname = parseHostname(url);
  if (hostname === null || !hostname.endsWith(".neon.tech")) return null;
  const match = /^(ep-[a-z0-9-]+?)(-pooler)?\./.exec(hostname);
  return match ? match[1] : null;
}

/** ローカル（Docker の PostgreSQL など）への接続か */
export function isLocalDatabaseUrl(url: string): boolean {
  const hostname = parseHostname(url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * CI のログで伏せ字にする値（ホスト名と Neon のエンドポイント ID）。
 * パスワードは GitHub が Secret 全体として伏せ字にするが、ホスト名は Prisma の出力に単独で現れるため。
 */
export function databaseLogMasks(url: string): string[] {
  const hostname = parseHostname(url);
  if (hostname === null) return [];
  const endpoint = neonEndpointId(url);
  return [...new Set([hostname, ...(endpoint ? [endpoint, `${endpoint}-pooler`] : [])])];
}

/** Neon のエンドポイント ID の書式（ep-cool-darkness-123456） */
export const NEON_ENDPOINT_ID_PATTERN = /^ep-[a-z0-9-]+$/;
