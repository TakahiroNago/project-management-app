import { describe, expect, it } from "vitest";
import {
  daysBetween,
  getDueState,
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

describe("daysBetween", () => {
  it("日数差を返す（月・年またぎ、うるう年を含む）", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-10-30", "2026-10-29")).toBe(-1);
  });
});

describe("getDueState", () => {
  const today = "2026-10-30";
  const due = (value: string) => parseDateOnly(value);

  it.each([
    ["2026-10-29", "overdue"],
    ["2026-10-30", "today"],
    ["2026-10-31", "soon"],
    ["2026-11-02", "soon"],
    ["2026-11-03", "later"],
  ] as const)("期限 %s は %s", (value, expected) => {
    expect(getDueState(due(value), false, today)).toBe(expected);
  });

  it("期限なし・完了済み", () => {
    expect(getDueState(null, false, today)).toBe("none");
    expect(getDueState(due("2026-10-01"), true, today)).toBe("done");
  });
});
