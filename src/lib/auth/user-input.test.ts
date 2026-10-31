import { describe, expect, it } from "vitest";
import { USER_NAME_MAX } from "@/features/auth/schemas";
import { checkUserInput } from "./user-input";

const signUp = { email: "a@example.com", password: "password1234" };

describe("checkUserInput", () => {
  it("対象外のエンドポイントは検証しない", () => {
    expect(checkUserInput("/sign-in/email", { name: "x".repeat(1000) })).toEqual({ ok: true, body: {} });
  });

  it("登録: 名前の前後の空白を除き、上限ちょうどまで受け付ける", () => {
    const name = "あ".repeat(USER_NAME_MAX);
    expect(checkUserInput("/sign-up/email", { ...signUp, name: `  ${name} ` })).toEqual({
      ok: true,
      body: { ...signUp, name },
    });
  });

  it.each([
    ["長すぎる名前", { ...signUp, name: "a".repeat(USER_NAME_MAX + 1) }],
    ["空白だけの名前", { ...signUp, name: "  " }],
    ["名前なし", { ...signUp }],
    ["文字列以外の名前", { ...signUp, name: ["a"] }],
    ["画像の URL", { ...signUp, name: "a", image: "https://example.com/a.png" }],
  ])("登録: %sは拒否する", (_, body) => {
    expect(checkUserInput("/sign-up/email", body)).toMatchObject({ ok: false });
  });

  it("プロフィール更新: 名前だけを受け付け、名前を送らない場合は Better Auth の検証に任せる", () => {
    expect(checkUserInput("/update-user", { name: " 新しい名前 " })).toEqual({ ok: true, body: { name: "新しい名前" } });
    expect(checkUserInput("/update-user", {})).toEqual({ ok: true, body: {} });
  });

  it.each([
    ["長すぎる名前", { name: "a".repeat(USER_NAME_MAX + 1) }],
    ["文字列以外の名前", { name: 1 }],
    ["画像", { image: null }],
    ["その他の項目", { name: "a", emailVerified: true }],
  ])("プロフィール更新: %sは拒否する", (_, body) => {
    expect(checkUserInput("/update-user", body)).toMatchObject({ ok: false });
  });

  it.each([null, "name", ["a"]])("オブジェクト以外の body は拒否する（%j）", (body) => {
    expect(checkUserInput("/update-user", body)).toMatchObject({ ok: false });
  });
});
