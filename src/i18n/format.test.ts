import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/domain/dates";
import { authErrorMessage } from "@/features/auth/error-message";
import { m } from "@/i18n";
import { formatDate, formatDateTime, formatPercent } from "./format";

describe("formatDate", () => {
  it("日付のみの値はタイムゾーンでずれずにそのまま表示する", () => {
    expect(formatDate(parseDateOnly("2026-01-01"))).toBe("2026/01/01");
    expect(formatDate(parseDateOnly("2026-12-31"))).toBe("2026/12/31");
  });

  it("未設定は代替文字を表示する", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined, "未設定")).toBe("未設定");
  });
});

describe("formatDateTime", () => {
  it("日時はアプリのタイムゾーン（Asia/Tokyo）で表示する", () => {
    // UTC 15:30 = JST 翌日 0:30
    expect(formatDateTime(new Date("2026-10-30T15:30:00Z"))).toBe("2026/10/31 00:30");
  });
});

describe("formatPercent", () => {
  it("0〜100 の値をパーセント表記にする", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(42)).toBe("42%");
    expect(formatPercent(100)).toBe("100%");
  });
});

describe("authErrorMessage", () => {
  it.each([
    [{ status: 429 }, m.auth.tooManyRequests],
    [{ code: "INVALID_EMAIL_OR_PASSWORD" }, m.auth.login.failed],
    [{ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }, m.auth.register.emailTaken],
    [{ code: "INVALID_PASSWORD" }, m.settings.password.wrongCurrent],
    [{ code: "INVALID_TOKEN" }, m.auth.resetPassword.invalidToken],
  ])("Better Auth のエラー %o を日本語のメッセージにする", (error, message) => {
    expect(authErrorMessage(error)).toBe(message);
  });

  it("想定外のエラーは内部メッセージを表示せず、汎用メッセージにする", () => {
    expect(authErrorMessage({ code: "SOMETHING", message: "internal detail" })).toBe(m.errors.unexpected);
    expect(authErrorMessage({}, "既定")).toBe("既定");
  });
});
