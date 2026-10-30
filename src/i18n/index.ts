import { ja, type Messages } from "./messages/ja";

/**
 * 現時点では日本語のみ。英語対応時はロケールを Cookie 等から決定し、
 * getMessages(locale) で切り替える（呼び出し側は m.xxx の参照のままでよい構造にしている）。
 */
export const LOCALE = "ja-JP";

/** 期限切れ判定・日時表示に使うアプリのタイムゾーン */
export const APP_TIME_ZONE = "Asia/Tokyo";

export const m: Messages = ja;

export type { Messages };
