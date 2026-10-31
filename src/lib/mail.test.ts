import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const RESET_URL = "https://app.example.com/api/auth/reset-password/SECRET_TOKEN_123?callbackURL=%2Freset-password";
const mail = { to: "user@example.com", name: "山田", url: RESET_URL };

/** NODE_ENV はモジュール読み込み時に評価されるため、環境変数を設定してから読み込み直す */
async function loadMail(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./mail");
}

/** console のすべての出力を連結した文字列 */
function capturedLogs() {
  const spies = (["info", "error", "warn", "log"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => {}),
  );
  return () => spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join("\n");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  send.mockReset();
});

describe("sendPasswordResetEmail", () => {
  it("開発環境で API キーが未設定ならリセット URL をコンソールに出力する", async () => {
    const logs = capturedLogs();
    const { sendPasswordResetEmail } = await loadMail({ NODE_ENV: "development", RESEND_API_KEY: "", MAIL_FROM: "" });
    expect(await sendPasswordResetEmail(mail)).toBe(true);
    expect(logs()).toContain(RESET_URL);
    expect(send).not.toHaveBeenCalled();
  });

  it("本番で設定が不足している場合は送信せず、URL・トークンをログに出さない", async () => {
    const logs = capturedLogs();
    const { sendPasswordResetEmail } = await loadMail({ NODE_ENV: "production", RESEND_API_KEY: "", MAIL_FROM: "" });
    expect(await sendPasswordResetEmail(mail)).toBe(false);
    expect(logs()).toContain("not configured");
    expect(logs()).not.toContain("SECRET_TOKEN_123");
  });

  it("本番では Resend でユーザー宛てに送信し、URL をログに出さない", async () => {
    const logs = capturedLogs();
    send.mockResolvedValue({ data: { id: "1" }, error: null });
    const { sendPasswordResetEmail } = await loadMail({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "ProjectFlow <noreply@example.com>",
    });
    expect(await sendPasswordResetEmail(mail)).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        from: "ProjectFlow <noreply@example.com>",
        text: expect.stringContaining(RESET_URL),
      }),
    );
    expect(logs()).not.toContain("SECRET_TOKEN_123");
  });

  describe("Preview", () => {
    const previewEnv = {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      RESEND_API_KEY: "re_preview",
      MAIL_FROM: "ProjectFlow <no-reply@mail.example.com>",
    };

    it("許可リストに無い宛先には送信せず、宛先・URL をログに出さない", async () => {
      const logs = capturedLogs();
      const { sendPasswordResetEmail } = await loadMail({ ...previewEnv, PREVIEW_MAIL_ALLOWED_RECIPIENTS: "dev@example.com" });
      expect(await sendPasswordResetEmail(mail)).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(logs()).toContain("not in PREVIEW_MAIL_ALLOWED_RECIPIENTS");
      expect(logs()).not.toContain("user@example.com");
      expect(logs()).not.toContain("SECRET_TOKEN_123");
    });

    it("許可リストが未設定なら誰にも送信しない", async () => {
      capturedLogs();
      const { sendPasswordResetEmail } = await loadMail({ ...previewEnv, PREVIEW_MAIL_ALLOWED_RECIPIENTS: "" });
      expect(await sendPasswordResetEmail(mail)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it("許可リストの宛先には送信する（大文字小文字・空白は無視）", async () => {
      capturedLogs();
      send.mockResolvedValue({ data: { id: "1" }, error: null });
      const { sendPasswordResetEmail } = await loadMail({
        ...previewEnv,
        PREVIEW_MAIL_ALLOWED_RECIPIENTS: "dev@example.com, User@Example.com",
      });
      expect(await sendPasswordResetEmail(mail)).toBe(true);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.com" }));
    });

    it("許可された宛先でも API キーが無ければ送信せず、URL をコンソールに出さない", async () => {
      const logs = capturedLogs();
      const { sendPasswordResetEmail } = await loadMail({
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
        RESEND_API_KEY: "",
        MAIL_FROM: "",
        PREVIEW_MAIL_ALLOWED_RECIPIENTS: "user@example.com",
      });
      expect(await sendPasswordResetEmail(mail)).toBe(false);
      expect(logs()).not.toContain("SECRET_TOKEN_123");
    });
  });

  it.each([
    ["Resend がエラーを返した場合", () => send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "Invalid from" } })],
    ["通信で例外が発生した場合", () => send.mockRejectedValue(new Error("network down"))],
  ])("%s は例外にせず false を返し、URL をログに出さない", async (_, setup) => {
    const logs = capturedLogs();
    setup();
    const { sendPasswordResetEmail } = await loadMail({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test",
      MAIL_FROM: "noreply@example.com",
    });
    await expect(sendPasswordResetEmail(mail)).resolves.toBe(false);
    expect(logs()).toContain("Failed to send");
    expect(logs()).not.toContain("SECRET_TOKEN_123");
  });
});
