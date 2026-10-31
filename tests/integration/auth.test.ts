import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER_NAME_MAX } from "@/features/auth/schemas";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { flushBackgroundTasks } from "../helpers/background";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

vi.mock("@/lib/mail", () => ({
  sendPasswordResetEmail: vi.fn(async () => true),
}));

const { sendPasswordResetEmail } = await import("@/lib/mail");
const sendMailMock = vi.mocked(sendPasswordResetEmail);

/** ログインして、以降のリクエストで使う Cookie ヘッダーを返す */
async function signIn(email: string, password: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const setCookie = headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=\s*[\w.-]+=)/)
    .map((part) => part.split(";")[0].trim())
    .join("; ");
  return new Headers({ cookie });
}

/** パスワード再設定をリクエストし、メールに記載されるトークンを取り出す */
async function requestResetToken(email: string) {
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
  await flushBackgroundTasks();
  const url = sendMailMock.mock.calls.at(-1)?.[0].url;
  if (!url) throw new Error("reset mail was not sent");
  return new URL(url).pathname.split("/").at(-1)!;
}

beforeEach(() => {
  sendMailMock.mockClear();
});

describe("ユーザー登録", () => {
  it("パスワードは平文で保存されず、ハッシュ化される", async () => {
    const user = await createUser();
    const account = await db.account.findFirstOrThrow({
      where: { userId: user.id, providerId: "credential" },
    });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe(TEST_PASSWORD);
    expect(account.password).not.toContain(TEST_PASSWORD);
  });

  it("同じメールアドレスでは登録できない", async () => {
    const user = await createUser();
    await expect(
      auth.api.signUpEmail({ body: { name: "dup", email: user.email, password: TEST_PASSWORD } }),
    ).rejects.toThrow();
    expect(await db.user.count({ where: { email: user.email } })).toBe(1);
  });

  it("短すぎる・長すぎるパスワードはサーバー側で拒否される", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "a", email: "short@example.com", password: "1234567" } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signUpEmail({
        body: { name: "a", email: "long@example.com", password: "x".repeat(129) },
      }),
    ).rejects.toThrow();
    expect(await db.user.count()).toBe(0);
  });
});

describe("ログイン・ログアウト・セッション", () => {
  it("正しいパスワードでログインでき、DB にセッションが作られる", async () => {
    const user = await createUser();
    const headers = await signIn(user.email, TEST_PASSWORD);
    const session = await auth.api.getSession({ headers });
    expect(session?.user.id).toBe(user.id);
    expect(await db.session.count({ where: { userId: user.id } })).toBeGreaterThanOrEqual(1);
  });

  it("誤ったパスワード・未登録のメールアドレスではログインできない", async () => {
    const user = await createUser();
    await expect(signIn(user.email, "wrong-password")).rejects.toThrow();
    await expect(signIn("nobody@example.com", TEST_PASSWORD)).rejects.toThrow();
  });

  it("ログアウトするとセッションが DB から削除され、同じ Cookie は使えなくなる", async () => {
    const user = await createUser();
    const headers = await signIn(user.email, TEST_PASSWORD);
    await auth.api.signOut({ headers });
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("改ざん・偽造された Cookie ではセッションを取得できない", async () => {
    const user = await createUser();
    const headers = await signIn(user.email, TEST_PASSWORD);
    const forged = new Headers({
      cookie: headers.get("cookie")!.replace(/session_token=([^;.]+)/, "session_token=forged"),
    });
    expect(await auth.api.getSession({ headers: forged })).toBeNull();
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: "better-auth.session_token=abc.def" }) }),
    ).toBeNull();
  });
});

describe("パスワード再設定", () => {
  it("リセット後は新しいパスワードでのみログインでき、既存セッションはすべて無効化される", async () => {
    const user = await createUser();
    const sessionA = await signIn(user.email, TEST_PASSWORD);
    const sessionB = await signIn(user.email, TEST_PASSWORD);

    const token = await requestResetToken(user.email);
    await auth.api.resetPassword({ body: { token, newPassword: "new-password-5678" } });

    expect(await auth.api.getSession({ headers: sessionA })).toBeNull();
    expect(await auth.api.getSession({ headers: sessionB })).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);

    await expect(signIn(user.email, TEST_PASSWORD)).rejects.toThrow();
    await expect(signIn(user.email, "new-password-5678")).resolves.toBeInstanceOf(Headers);
  });

  it("リセット用メールにはユーザー宛てのリセット URL が含まれる", async () => {
    const user = await createUser("山田");
    await requestResetToken(user.email);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    expect(mail.name).toBe("山田");
    expect(mail.url).toMatch(/^http:\/\/localhost:3000\/api\/auth\/reset-password\/[\w-]+\?callbackURL=/);
  });

  it("トークンは使い捨てで、2 回目は使えない", async () => {
    const user = await createUser();
    const token = await requestResetToken(user.email);
    await auth.api.resetPassword({ body: { token, newPassword: "new-password-5678" } });
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "another-password-9999" } }),
    ).rejects.toThrow();
    await expect(signIn(user.email, "new-password-5678")).resolves.toBeInstanceOf(Headers);
  });

  it("有効期限切れのトークンは使えない", async () => {
    const user = await createUser();
    const token = await requestResetToken(user.email);
    await db.verification.updateMany({
      where: { identifier: `reset-password:${token}` },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "new-password-5678" } }),
    ).rejects.toThrow();
    await expect(signIn(user.email, TEST_PASSWORD)).resolves.toBeInstanceOf(Headers);
  });

  it("トークンの有効期限は 30 分", async () => {
    const user = await createUser();
    const before = Date.now();
    const token = await requestResetToken(user.email);
    const verification = await db.verification.findFirstOrThrow({
      where: { identifier: `reset-password:${token}` },
    });
    const ttl = verification.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(31 * 60 * 1000);
  });

  it("存在しないトークンは使えない", async () => {
    await expect(
      auth.api.resetPassword({ body: { token: "invalid-token", newPassword: "new-password-5678" } }),
    ).rejects.toThrow();
  });

  it("未登録のメールアドレスでも同じ応答を返し、メールは送信しない（ユーザー列挙対策）", async () => {
    const user = await createUser();
    const registered = await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: "/reset-password" },
    });
    const unknown = await auth.api.requestPasswordReset({
      body: { email: "nobody@example.com", redirectTo: "/reset-password" },
    });
    await flushBackgroundTasks();
    expect(unknown).toEqual(registered);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it("外部サイトへのリダイレクト URL は拒否される（オープンリダイレクト対策）", async () => {
    const user = await createUser();
    const response = await postToAuthHandler(
      "/request-password-reset",
      { email: user.email, redirectTo: "https://evil.example.com/steal" },
      { origin: "http://localhost:3000" },
    );
    expect(response.status).toBe(403);
    await flushBackgroundTasks();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("HTTP エンドポイント（CSRF 対策）", () => {
  it("信頼されていないオリジンからのログインリクエストは拒否される", async () => {
    const user = await createUser();
    const response = await postToAuthHandler(
      "/sign-in/email",
      { email: user.email, password: TEST_PASSWORD },
      { origin: "https://evil.example.com", cookie: "dummy=1" },
    );
    expect(response.status).toBe(403);
  });

  it("同一オリジンからのログインリクエストは受け付ける", async () => {
    const user = await createUser();
    const response = await postToAuthHandler(
      "/sign-in/email",
      { email: user.email, password: TEST_PASSWORD },
      { origin: "http://localhost:3000" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/session_token=.*HttpOnly/i);
  });
});

describe("登録・プロフィール更新の入力検証（API を直接呼んだ場合）", () => {
  const origin = { origin: "http://localhost:3000" };

  it("登録: 長すぎる名前・空白だけの名前・画像の URL は拒否され、ユーザーは作られない", async () => {
    for (const body of [
      { name: "a".repeat(USER_NAME_MAX + 1), email: "long-name@example.com", password: TEST_PASSWORD },
      { name: "   ", email: "blank-name@example.com", password: TEST_PASSWORD },
      { name: "画像あり", email: "image@example.com", password: TEST_PASSWORD, image: "https://evil.example.com/a.png" },
    ]) {
      const response = await postToAuthHandler("/sign-up/email", body, origin);
      expect(response.status).toBe(400);
    }
    expect(await db.user.count()).toBe(0);
  });

  it("登録: 名前は前後の空白を除いて保存され、上限ちょうどの長さは登録できる", async () => {
    const name = "あ".repeat(USER_NAME_MAX);
    const response = await postToAuthHandler(
      "/sign-up/email",
      { name: `  ${name}  `, email: "max-name@example.com", password: TEST_PASSWORD },
      origin,
    );
    expect(response.status).toBe(200);
    expect(await db.user.findUniqueOrThrow({ where: { email: "max-name@example.com" } })).toMatchObject({ name });
  });

  it("プロフィール更新: 長すぎる名前・文字列以外・画像・その他の項目は拒否され、名前は変わらない", async () => {
    const user = await createUser("before");
    const cookie = (await signIn(user.email, TEST_PASSWORD)).get("cookie")!;
    for (const body of [
      { name: "a".repeat(USER_NAME_MAX + 1) },
      { name: { $ne: "" } },
      { name: 123 },
      { image: "https://evil.example.com/a.png" },
      { name: "ok", emailVerified: true },
    ]) {
      const response = await postToAuthHandler("/update-user", body, { ...origin, cookie });
      expect(response.status).toBe(400);
    }
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: "before",
      image: null,
      emailVerified: false,
    });

    const ok = await postToAuthHandler("/update-user", { name: "  after  " }, { ...origin, cookie });
    expect(ok.status).toBe(200);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: "after" });
  });
});

/** Route Handler と同じ経路（auth.handler）で HTTP リクエストを処理する */
function postToAuthHandler(path: string, body: unknown, headers: Record<string, string>) {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}
