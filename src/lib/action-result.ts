import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { m } from "@/i18n";
import { AppError, ValidationError } from "@/lib/errors";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

const ERROR_MESSAGES: Record<AppError["code"], string> = {
  UNAUTHORIZED: m.errors.unauthorized,
  FORBIDDEN: m.errors.forbidden,
  NOT_FOUND: m.errors.notFound,
  VALIDATION: m.errors.validation,
  CONFLICT: m.errors.conflict,
};

/**
 * Server Action の共通ラッパー。
 * 例外を ActionResult に変換し、予期しない例外は詳細をクライアントに返さずログにのみ記録する。
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    // redirect() / notFound() は Next.js に処理させる
    unstable_rethrow(error);

    if (error instanceof ValidationError) {
      const message = error.message === "VALIDATION" ? ERROR_MESSAGES.VALIDATION : error.message;
      return { ok: false, error: message, fieldErrors: error.fieldErrors };
    }
    if (error instanceof AppError) {
      return { ok: false, error: ERROR_MESSAGES[error.code] };
    }
    console.error("[action] Unexpected error:", error);
    return { ok: false, error: m.errors.unexpected };
  }
}

/** 入力を Zod で検証し、失敗時は項目ごとのエラーを持つ ValidationError を投げる */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ValidationError(undefined, fieldErrors);
  }
  return result.data;
}
