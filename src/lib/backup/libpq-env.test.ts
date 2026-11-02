import { describe, expect, it } from "vitest";
import { libpqEnv } from "./libpq-env";

describe("libpqEnv", () => {
  it("Neon の接続文字列を libpq の環境変数に変換する", () => {
    expect(
      libpqEnv(
        "postgresql://backup_reader:p%40ss%2Fw0rd@ep-cool-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      ),
    ).toEqual({
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
    expect(libpqEnv("postgres://u:p@[::1]:5433/app")).toMatchObject({ PGHOST: "::1", PGPORT: "5433", PGDATABASE: "app" });
  });

  it("パスワードが無ければ PGPASSWORD を設定しない", () => {
    expect(libpqEnv("postgresql://u@localhost/app")).not.toHaveProperty("PGPASSWORD");
  });

  it.each([
    ["URL でない", "not a url"],
    ["PostgreSQL 以外", "mysql://u:p@localhost/app"],
    ["DB 名が無い", "postgresql://u:p@localhost/"],
    ["ユーザーが無い", "postgresql://localhost/app"],
  ])("%s ならエラーにする", (_, url) => {
    expect(() => libpqEnv(url)).toThrow();
  });

  it("未対応のパラメーターは無視せずエラーにする（値は含めない）", () => {
    expect(() => libpqEnv("postgresql://u:p@localhost/app?sslrootcert=secret-path")).toThrow(
      "Unsupported connection parameter: sslrootcert",
    );
    expect(() => libpqEnv("postgresql://u:p@localhost/app?sslrootcert=secret-path")).not.toThrow("secret-path");
  });
});
