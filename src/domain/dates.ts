/**
 * 日付のみ（時刻なし）の値の扱い。
 * 開始日・期限は "YYYY-MM-DD" 文字列でやり取りし、DB には DATE 型（JS では UTC 0時の Date）で保存する。
 */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" が実在する日付かを判定する（2026-02-30 などは false） */
export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const [, y, mo, d] = match.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** "YYYY-MM-DD" → UTC 0時の Date */
export function parseDateOnly(value: string): Date {
  if (!isValidDateOnly(value)) {
    throw new RangeError(`Invalid date-only value: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

/** UTC 0時の Date → "YYYY-MM-DD" */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 指定タイムゾーンにおける「今日」を "YYYY-MM-DD" で返す */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA ロケールは YYYY-MM-DD 形式で出力される
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 期限切れか（期限が「今日」より前で、かつ未完了）。
 * 期限当日は期限切れではない。
 */
export function isOverdue(
  dueDate: Date | null | undefined,
  isDone: boolean,
  today: string,
): boolean {
  if (!dueDate || isDone) return false;
  return toDateOnlyString(dueDate) < today;
}
