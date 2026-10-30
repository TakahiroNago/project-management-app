import { describe, expect, it } from "vitest";
import {
  isOverdue,
  isValidDateOnly,
  parseDateOnly,
  toDateOnlyString,
  todayInTimeZone,
} from "./dates";

describe("isValidDateOnly", () => {
  it.each(["2026-01-01", "2024-02-29", "2026-12-31"])("%s は有効", (value) => {
    expect(isValidDateOnly(value)).toBe(true);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-1-1", "2026/01/01", "", "2026-01-01T00:00:00Z"])(
    "%s は無効",
    (value) => {
      expect(isValidDateOnly(value)).toBe(false);
    },
  );
});

describe("parseDateOnly / toDateOnlyString", () => {
  it("UTC 0時の Date に変換し、元の文字列に戻せる", () => {
    const date = parseDateOnly("2026-10-30");
    expect(date.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(toDateOnlyString(date)).toBe("2026-10-30");
  });

  it("無効な値は例外", () => {
    expect(() => parseDateOnly("2026-02-30")).toThrow(RangeError);
  });
});

describe("todayInTimeZone", () => {
  it("タイムゾーンで日付が変わる境界を正しく扱う", () => {
    // UTC 2026-10-30 15:30 = JST 2026-10-31 00:30
    const now = new Date("2026-10-30T15:30:00Z");
    expect(todayInTimeZone("Asia/Tokyo", now)).toBe("2026-10-31");
    expect(todayInTimeZone("UTC", now)).toBe("2026-10-30");
  });
});

describe("isOverdue", () => {
  const today = "2026-10-30";

  it("期限が今日より前で未完了なら期限切れ", () => {
    expect(isOverdue(parseDateOnly("2026-10-29"), false, today)).toBe(true);
  });

  it("期限当日は期限切れではない", () => {
    expect(isOverdue(parseDateOnly("2026-10-30"), false, today)).toBe(false);
  });

  it("完了済み・期限なしは期限切れではない", () => {
    expect(isOverdue(parseDateOnly("2026-10-01"), true, today)).toBe(false);
    expect(isOverdue(null, false, today)).toBe(false);
  });
});
