import { describe, expect, it } from "vitest";
import { checkSourceSnapshot, compareSnapshots, type DbSnapshot } from "./snapshot";

const source: DbSnapshot = {
  rowCounts: { "public._prisma_migrations": "3", "public.users": "12345", "public.projects": "678" },
  objects: ["relation:r:public.users", "relation:r:public.projects", "trigger:public.projects.owner_check"],
  migrations: ["20261030122730_init:abc:finished:active"],
};
const copy = (): DbSnapshot => structuredClone(source);

describe("compareSnapshots", () => {
  it("一致すれば問題なし", () => {
    expect(compareSnapshots(source, copy())).toEqual([]);
  });

  it("行数の違いを、行数そのものは出さずに報告する", () => {
    const restored = copy();
    restored.rowCounts["public.users"] = "12344";
    const errors = compareSnapshots(source, restored);
    expect(errors).toEqual(["Row counts differ from the source for: public.users."]);
    expect(errors.join()).not.toMatch(/12345|12344/);
  });

  it("テーブルの不足・余分を報告する", () => {
    const restored = copy();
    delete restored.rowCounts["public.projects"];
    restored.rowCounts["public.extra"] = "0";
    const errors = compareSnapshots(source, restored).join("\n");
    expect(errors).toContain("Tables missing from the restored dump: public.projects.");
    expect(errors).toContain("Unexpected tables in the restored dump: public.extra.");
  });

  it("スキーマのオブジェクト（トリガーなど）の不足を報告する", () => {
    const restored = copy();
    restored.objects = restored.objects.filter((o) => !o.startsWith("trigger:"));
    expect(compareSnapshots(source, restored)).toEqual([
      "Schema objects missing from the restored dump: trigger:public.projects.owner_check.",
    ]);
  });

  it("マイグレーションの履歴の違いを報告する", () => {
    const restored = copy();
    restored.migrations = [];
    expect(compareSnapshots(source, restored)).toEqual(["The migration history (_prisma_migrations) differs from the source."]);
  });

  it("違いが多い場合は 10 件まで表示し、総数を示す", () => {
    const restored = copy();
    const many = Array.from({ length: 15 }, (_, i) => `function:public.f${i}()`);
    const errors = compareSnapshots({ ...source, objects: [...source.objects, ...many] }, restored);
    expect(errors[0]).toContain("(15 in total)");
    expect(errors[0]).not.toContain("f10");
  });
});

describe("checkSourceSnapshot", () => {
  it("マイグレーションの履歴とアプリのテーブルがあれば問題なし", () => {
    expect(checkSourceSnapshot(source)).toEqual([]);
  });

  it("空の DB・別の DB に接続している場合は止める", () => {
    expect(checkSourceSnapshot({ rowCounts: {}, objects: [], migrations: [] }).join()).toContain("no _prisma_migrations table");
    expect(
      checkSourceSnapshot({ rowCounts: { "public._prisma_migrations": "0", "public.users": "0" }, objects: [], migrations: [] }).join(),
    ).toContain("no applied migrations");
  });
});
