import { APP_TIME_ZONE, LOCALE } from "./index";

// 開始日・期限は時刻を持たない日付（DB では DATE 型、JS では UTC 0時の Date）なので UTC で表示する
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: APP_TIME_ZONE,
});

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 0,
});

/** 日付のみの値（開始日・期限）を表示用に整形する */
export function formatDate(date: Date | null | undefined, fallback = "—"): string {
  return date ? dateFormatter.format(date) : fallback;
}

/** 日時（作成日時・更新日時）をアプリのタイムゾーンで整形する */
export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

/** 0〜100 の整数を "42%" 形式に整形する */
export function formatPercent(percent: number): string {
  return percentFormatter.format(percent / 100);
}
