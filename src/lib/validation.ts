import { z } from "zod";
import { isValidDateOnly } from "@/domain/dates";
import { m } from "@/i18n";

/** DB の ID（cuid / Better Auth の ID）。形式は緩めに、長さだけ制限する */
export const idSchema = z.string().trim().min(1).max(64);

/** 必須の文字列（前後の空白を除去） */
export function requiredText(max: number) {
  return z
    .string({ error: m.validation.required })
    .trim()
    .min(1, { error: m.validation.required })
    .max(max, { error: m.validation.tooLong(max) });
}

/** 任意の文字列。空文字は null として扱う */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: m.validation.tooLong(max) })
    .nullish()
    .transform((value) => (value ? value : null));
}

/** 任意の日付（"YYYY-MM-DD"）。空文字は null として扱う */
export const optionalDateOnly = z
  .string()
  .trim()
  .nullish()
  .refine((value) => !value || isValidDateOnly(value), { error: m.validation.invalidDate })
  .transform((value) => (value ? value : null));

/** 開始日 <= 期限 の検証（どちらかが未設定なら OK）。"YYYY-MM-DD" は文字列比較で前後関係が分かる */
export function isDateRangeValid(range: { startDate: string | null; dueDate: string | null }) {
  return !range.startDate || !range.dueDate || range.startDate <= range.dueDate;
}
