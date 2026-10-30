import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { m } from "@/i18n";
import { parseInput, runAction } from "./action-result";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "./errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAction", () => {
  it("成功時は data を返す", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });

  it.each([
    [new UnauthorizedError(), m.errors.unauthorized],
    [new ForbiddenError(), m.errors.forbidden],
    [new NotFoundError(), m.errors.notFound],
  ])("アプリのエラーを利用者向けメッセージに変換する（%s）", async (error, message) => {
    expect(await runAction(async () => Promise.reject(error))).toEqual({ ok: false, error: message });
  });

  it("入力エラーは項目ごとのエラーを返す", async () => {
    const result = await runAction(async () => {
      throw new ValidationError(undefined, { name: ["必須です"] });
    });
    expect(result).toEqual({ ok: false, error: m.errors.validation, fieldErrors: { name: ["必須です"] } });
  });

  it("独自メッセージ付きの入力エラーはそのメッセージを返す", async () => {
    const result = await runAction(async () => {
      throw new ValidationError("担当者が不正です", { assigneeId: ["担当者が不正です"] });
    });
    expect(result).toMatchObject({ ok: false, error: "担当者が不正です" });
  });

  it("予期しない例外は詳細を返さず、汎用メッセージにしてログにだけ残す", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAction(async () => {
      throw new Error('connection to postgres://user:secret@db failed at "SELECT * FROM users"');
    });
    expect(result).toEqual({ ok: false, error: m.errors.unexpected });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("parseInput", () => {
  const schema = z.object({ name: z.string().min(1, "必須"), nested: z.object({ n: z.number() }) });

  it("検証に通れば変換後の値を返す", () => {
    expect(parseInput(schema, { name: "a", nested: { n: 1 } })).toEqual({ name: "a", nested: { n: 1 } });
  });

  it("失敗時はパスごとにまとめた ValidationError を投げる", () => {
    try {
      parseInput(schema, { name: "", nested: { n: "x" } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors).toMatchObject({
        name: ["必須"],
        "nested.n": [expect.any(String)],
      });
    }
  });

  it("オブジェクト以外の入力はフォーム全体のエラーにする", () => {
    expect(() => parseInput(schema, null)).toThrow(ValidationError);
    try {
      parseInput(schema, "text");
    } catch (error) {
      expect(Object.keys((error as ValidationError).fieldErrors)).toEqual(["_form"]);
    }
  });
});
