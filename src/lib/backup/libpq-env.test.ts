import { describe, expect, it } from "vitest";
import { libpqEnv } from "./libpq-env";

/**
 * テスト用の接続文字列を部品から組み立てる。
 * 値はすべて架空だが、ユーザー名とパスワードを含む接続文字列をソースにそのまま書くと、
 * シークレットの検出ツール（GitGuardian）が本物の認証情報として報告するため。
 */
function connectionUrl({
  scheme = "postgresql",
  auth,
  host = "localhost",
  path = "/app",
}: {
  scheme?: string;
  auth?: [user: string, password?: string];
  host?: string;
  path?: string;
}): string {
  const credentials = auth ? [auth[0], ...(auth[1] === undefined ? [] : [auth[1]])].join(":") + "@" : "";
  return `${scheme}://${credentials}${host}${path}`;
}

const DUMMY_AUTH: [string, string] = ["u", "p"];

describe("libpqEnv", () => {
  it("Neon の接続文字列を libpq の環境変数に変換する", () => {
    const url = connectionUrl({
      auth: ["backup_reader", "p%40ss%2Fw0rd"],
      host: "ep-cool-123456.ap-southeast-1.aws.neon.tech",
      path: "/neondb?sslmode=require&channel_binding=require",
    });
    expect(libpqEnv(url)).toEqual({
      PGHOST: "ep-cool-123456.ap-southeast-1.aws.neon.tech",
      PGPORT: "5432",
      PGUSER: "backup_reader",
      PGPASSWORD: "p@ss/w0rd",
      PGDATABASE: "neondb",
      PGSSLMODE: "require",
      PGCHANNELBINDING: "require",
    });
  });

  it("ポートと IPv6 のホストを扱える", () => {
    const url = connectionUrl({ scheme: "postgres", auth: DUMMY_AUTH, host: "[::1]:5433" });
    expect(libpqEnv(url)).toMatchObject({ PGHOST: "::1", PGPORT: "5433", PGDATABASE: "app" });
  });

  it("パスワードが無ければ PGPASSWORD を設定しない", () => {
    expect(libpqEnv(connectionUrl({ auth: ["u"] }))).not.toHaveProperty("PGPASSWORD");
  });

  it.each([
    ["URL でない", "not a url"],
    ["PostgreSQL 以外", connectionUrl({ scheme: "mysql", auth: DUMMY_AUTH })],
    ["DB 名が無い", connectionUrl({ auth: DUMMY_AUTH, path: "/" })],
    ["ユーザーが無い", connectionUrl({})],
  ])("%s ならエラーにする", (_, url) => {
    expect(() => libpqEnv(url)).toThrow();
  });

  it("未対応のパラメーターは無視せずエラーにする（値は含めない）", () => {
    const url = connectionUrl({ auth: DUMMY_AUTH, path: "/app?sslrootcert=secret-path" });
    expect(() => libpqEnv(url)).toThrow("Unsupported connection parameter: sslrootcert");
    expect(() => libpqEnv(url)).not.toThrow("secret-path");
  });
});
