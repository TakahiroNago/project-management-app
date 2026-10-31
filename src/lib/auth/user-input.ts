import { USER_NAME_MAX } from "@/features/auth/schemas";
import { requiredText } from "@/lib/validation";

/** ユーザー情報（名前）を受け取る Better Auth のエンドポイント */
export const USER_INPUT_PATHS = ["/sign-up/email", "/update-user"] as const;

/** /update-user で変更を許可する項目（メールアドレスは Better Auth 自身が拒否する） */
const UPDATABLE_USER_FIELDS = new Set(["name"]);

const nameSchema = requiredText(USER_NAME_MAX);

export type UserInputCheck =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * 登録・プロフィール更新の入力を、画面のフォームと同じ規則（features/auth/schemas.ts）でサーバー側でも検証する。
 * Better Auth は名前の長さを制限せず（/update-user では型も検証しない）、画像の URL も受け付けるため、
 * API を直接呼ばれた場合に備える。
 *
 * - name: 必須（/update-user では送られた場合のみ）。前後の空白を除いて 1〜USER_NAME_MAX 文字
 * - image: 受け付けない（ProjectFlow はプロフィール画像を使わない）
 * - /update-user: name 以外の項目は受け付けない
 *
 * @returns 検証済みの body（name は前後の空白を除いた値）、または利用者向けのエラーメッセージ
 */
export function checkUserInput(path: string, body: unknown): UserInputCheck {
  if (!(USER_INPUT_PATHS as readonly string[]).includes(path)) return { ok: true, body: {} };
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Invalid request body." };
  }
  const input = body as Record<string, unknown>;

  if (input.image !== undefined) return { ok: false, message: "Profile images are not supported." };
  if (path === "/update-user") {
    const unknownField = Object.keys(input).find((key) => !UPDATABLE_USER_FIELDS.has(key));
    if (unknownField !== undefined) return { ok: false, message: "This field cannot be updated." };
    if (input.name === undefined) return { ok: true, body: input };
  }

  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, message: name.error.issues[0]?.message ?? "Invalid name." };
  return { ok: true, body: { ...input, name: name.data } };
}
