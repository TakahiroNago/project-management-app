import { describe, expect, it } from "vitest";
import { backupKeyTimestamp, backupObjectKey, RETENTION_DAYS, selectExpiredBackups, type StoredObject } from "./retention";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-12-31T19:05:00Z");

/** now から days 日前に取得・アップロードしたバックアップ */
function backup(target: "production" | "preview", days: number, uploadDelayMs = 60_000): StoredObject {
  const takenAt = new Date(now.getTime() - days * DAY);
  return { key: backupObjectKey(target, takenAt), lastModified: new Date(takenAt.getTime() + uploadDelayMs) };
}

describe("backupObjectKey / backupKeyTimestamp", () => {
  it("UTC の日時を含むキーを作り、そこから日時を取り出せる", () => {
    const date = new Date("2026-11-02T19:00:12.345Z");
    const key = backupObjectKey("production", date);
    expect(key).toBe("production/projectflow-production-20261102T190012Z.dump.gpg");
    expect(backupKeyTimestamp(key)?.toISOString()).toBe("2026-11-02T19:00:12.000Z");
  });

  it.each([
    "production/other-file.txt",
    "production/projectflow-preview-20261102T190012Z.dump.gpg",
    "preview/projectflow-production-20261102T190012Z.dump.gpg",
    "production/projectflow-production-20261102T190012Z.dump",
    "production/projectflow-production-20261399T990000Z.dump.gpg",
  ])("このワークフローの形式でないキー（%s）は null", (key) => {
    expect(backupKeyTimestamp(key)).toBeNull();
  });
});

describe("selectExpiredBackups", () => {
  it(`${RETENTION_DAYS} 日を過ぎたものだけを選ぶ`, () => {
    const objects = [backup("production", 0), backup("production", 30), backup("production", 32), backup("production", 40)];
    expect(selectExpiredBackups(objects, { target: "production", now })).toEqual([objects[2].key, objects[3].key]);
  });

  it("最新のものは期間を過ぎても残す（バックアップが止まっていても、最後の 1 つは消さない）", () => {
    const objects = [backup("production", 50), backup("production", 60), backup("production", 45)];
    expect(selectExpiredBackups(objects, { target: "production", now })).toEqual([objects[0].key, objects[1].key]);
  });

  it("1 つしか無ければ何も削除しない", () => {
    expect(selectExpiredBackups([backup("production", 100)], { target: "production", now })).toEqual([]);
  });

  it("アップロード日時（LastModified）が期間内なら削除しない（バケットのロックの期限前に削除しない）", () => {
    const late = backup("production", 32, 2 * DAY);
    expect(selectExpiredBackups([backup("production", 0), late], { target: "production", now })).toEqual([]);
  });

  it("別の環境のもの・形式の違うファイルには触れない", () => {
    const objects = [
      backup("production", 0),
      backup("preview", 60),
      backup("preview", 61),
      { key: "production/notes.txt", lastModified: new Date(now.getTime() - 90 * DAY) },
      { key: "production/projectflow-production-20200101T000000Z.dump", lastModified: new Date(now.getTime() - 90 * DAY) },
    ];
    expect(selectExpiredBackups(objects, { target: "production", now })).toEqual([]);
    expect(selectExpiredBackups(objects, { target: "preview", now })).toEqual([objects[2].key]);
  });

  it("最新かどうかは一覧の順番ではなく、キーの日時で判断する", () => {
    const newest = backup("production", 35);
    const older = backup("production", 36);
    expect(selectExpiredBackups([older, newest], { target: "production", now })).toEqual([older.key]);
  });
});
