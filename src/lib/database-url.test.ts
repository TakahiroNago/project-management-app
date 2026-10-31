import { describe, expect, it } from "vitest";
import { databaseLogMasks, isLocalDatabaseUrl, isNeonPooledUrl, isPostgresUrl, neonEndpointId } from "./database-url";

const POOLED = "postgresql://app:pw@ep-cool-darkness-a1b2c3-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://app:pw@ep-cool-darkness-a1b2c3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://projectflow:projectflow@localhost:5433/projectflow";

describe("database-url", () => {
  it("PostgreSQL の接続文字列かを判定する", () => {
    expect(isPostgresUrl(POOLED)).toBe(true);
    expect(isPostgresUrl("postgres://u:p@db.example.com/app")).toBe(true);
    expect(isPostgresUrl("mysql://u:p@localhost/app")).toBe(false);
    expect(isPostgresUrl("not a url")).toBe(false);
  });

  it("Neon の Pooled Connection を判定する", () => {
    expect(isNeonPooledUrl(POOLED)).toBe(true);
    expect(isNeonPooledUrl(DIRECT)).toBe(false);
    expect(isNeonPooledUrl(LOCAL)).toBe(false);
  });

  it("Pooled / Direct のどちらからも同じエンドポイント ID を取り出す", () => {
    expect(neonEndpointId(POOLED)).toBe("ep-cool-darkness-a1b2c3");
    expect(neonEndpointId(DIRECT)).toBe("ep-cool-darkness-a1b2c3");
    expect(neonEndpointId(LOCAL)).toBeNull();
    // neon.tech 以外のホストは対象外
    expect(neonEndpointId("postgresql://u:p@ep-fake-1.example.com/db")).toBeNull();
  });

  it("ログで伏せ字にする値として、ホスト名とエンドポイント ID を返す（パスワードは含めない）", () => {
    expect(databaseLogMasks(DIRECT)).toEqual([
      "ep-cool-darkness-a1b2c3.ap-southeast-1.aws.neon.tech",
      "ep-cool-darkness-a1b2c3",
      "ep-cool-darkness-a1b2c3-pooler",
    ]);
    expect(databaseLogMasks(POOLED)).toContain("ep-cool-darkness-a1b2c3");
    expect(databaseLogMasks(LOCAL)).toEqual(["localhost"]);
    expect(databaseLogMasks("not a url")).toEqual([]);
    expect(databaseLogMasks(DIRECT).join()).not.toContain("pw");
  });

  it("ローカルの DB かを判定する", () => {
    expect(isLocalDatabaseUrl(LOCAL)).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalDatabaseUrl(DIRECT)).toBe(false);
    // ユーザー名に localhost を含むだけのリモート URL は対象外
    expect(isLocalDatabaseUrl("postgresql://localhost:pw@ep-x.aws.neon.tech/db")).toBe(false);
  });
});
