/**
 * PostgreSQL の接続文字列を、pg_dump / pg_restore に渡す libpq の環境変数（PGHOST など）に変換する。
 * 接続文字列をコマンドライン引数で渡すと、パスワードがプロセスの一覧（ps）から見えるため。
 *
 * 想定外のクエリパラメーターは黙って無視せず、エラーにする（sslmode などの指定が抜け落ちるのを防ぐ）。
 * エラーメッセージに値は含めない。
 */

const PARAMETERS: Record<string, string> = {
  sslmode: "PGSSLMODE",
  channel_binding: "PGCHANNELBINDING",
  options: "PGOPTIONS",
  connect_timeout: "PGCONNECT_TIMEOUT",
  application_name: "PGAPPNAME",
};

export type LibpqEnv = Record<string, string>;

export function libpqEnv(url: string): LibpqEnv {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("The connection string is not a valid URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("The connection string is not a PostgreSQL URL.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !parsed.username || !database) {
    throw new Error("The connection string must include a host, a user and a database name.");
  }

  const env: LibpqEnv = {
    // [::1] のような IPv6 の表記は、libpq では角括弧を外して渡す
    PGHOST: parsed.hostname.replace(/^\[(.*)\]$/, "$1"),
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGDATABASE: database,
  };
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);

  for (const [key, value] of parsed.searchParams) {
    const name = PARAMETERS[key];
    if (!name) throw new Error(`Unsupported connection parameter: ${key}`);
    env[name] = value;
  }
  return env;
}
