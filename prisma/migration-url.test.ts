import { describe, expect, it } from "vitest";
import { resolveMigrationUrl } from "./migration-url";

const LOCAL = "postgresql://projectflow:projectflow@localhost:5433/projectflow";
const NEON_DIRECT = "postgresql://owner:pw@ep-prod-main-111111.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const NEON_POOLED = "postgresql://app:pw@ep-prod-main-111111-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

describe("resolveMigrationUrl", () => {
  it("DIRECT_URL があれば常にそれを使う", () => {
    expect(resolveMigrationUrl({ DIRECT_URL: NEON_DIRECT, DATABASE_URL: NEON_POOLED })).toBe(NEON_DIRECT);
    expect(resolveMigrationUrl({ DIRECT_URL: NEON_DIRECT, DATABASE_URL: LOCAL })).toBe(NEON_DIRECT);
  });

  it("DIRECT_URL に Pooled Connection が設定されていたら例外にする（値はメッセージに含めない）", () => {
    expect(() => resolveMigrationUrl({ DIRECT_URL: NEON_POOLED })).toThrow(/pooled/);
    try {
      resolveMigrationUrl({ DIRECT_URL: NEON_POOLED });
    } catch (e) {
      expect(String(e)).not.toContain("app:pw");
    }
  });

  it("DIRECT_URL が無く DATABASE_URL がリモート（Pooled など）なら接続先なし（マイグレーションできない）", () => {
    expect(resolveMigrationUrl({ DATABASE_URL: NEON_POOLED })).toBeUndefined();
    expect(resolveMigrationUrl({ DATABASE_URL: NEON_DIRECT })).toBeUndefined();
  });

  it("DIRECT_URL が無くても DATABASE_URL がローカルならそれを使う（開発・テスト・CI）", () => {
    expect(resolveMigrationUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it("何も設定されていなければ接続先なし（prisma generate はこの状態でも動く）", () => {
    expect(resolveMigrationUrl({})).toBeUndefined();
  });

  describe("ローカル専用のコマンド（R5）", () => {
    const argv = (...args: string[]) => ["node", "/app/node_modules/prisma/build/index.js", ...args];

    it.each([
      ["migrate dev", argv("migrate", "dev")],
      ["migrate reset", argv("migrate", "reset", "--force")],
      ["db push", argv("db", "push", "--accept-data-loss")],
    ])("リモートの DB に対する %s は拒否する", (_, args) => {
      expect(() => resolveMigrationUrl({ DIRECT_URL: NEON_DIRECT }, args)).toThrow(/allowed only for a local database/);
    });

    it("ローカルの DB に対する migrate dev / reset は許可する", () => {
      expect(resolveMigrationUrl({ DATABASE_URL: LOCAL }, argv("migrate", "dev"))).toBe(LOCAL);
      expect(resolveMigrationUrl({ DIRECT_URL: LOCAL }, argv("migrate", "reset"))).toBe(LOCAL);
    });

    it.each([
      ["migrate deploy", argv("migrate", "deploy")],
      ["migrate status", argv("migrate", "status")],
      ["generate", argv("generate")],
    ])("リモートの DB でも %s は許可する", (_, args) => {
      expect(resolveMigrationUrl({ DIRECT_URL: NEON_DIRECT }, args)).toBe(NEON_DIRECT);
    });

    it("migrate dev でも接続先が無ければ例外にしない（Prisma 側で接続先なしのエラーになる）", () => {
      expect(resolveMigrationUrl({ DATABASE_URL: NEON_POOLED }, argv("migrate", "dev"))).toBeUndefined();
    });
  });
});
