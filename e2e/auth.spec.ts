import { expect, test } from "@playwright/test";
import { login, logout, PASSWORD, register } from "./helpers";

test("未ログインで保護されたページにアクセスするとログイン画面に移動する", async ({ page }) => {
  for (const path of ["/dashboard", "/projects", "/projects/new", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("偽造したセッション Cookie では保護されたページを表示できない", async ({ page, context }) => {
  await context.addCookies([
    { name: "better-auth.session_token", value: "forged.token", url: "http://localhost:3100" },
  ]);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login$/);
});

test("ユーザー登録 → ログアウト → ログインができる", async ({ page }) => {
  const user = await register(page, "E2E 登録ユーザー");
  await expect(page.getByText(`ようこそ、${user.name} さん`)).toBeVisible();

  await logout(page);

  // ログアウト後は保護ページに入れない
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await login(page, user.email, "wrong-password");
  await expect(page.getByText("メールアドレスまたはパスワードが正しくありません")).toBeVisible();

  await login(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("登録フォームはクライアント側でも入力を検証する", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("名前").fill("x");
  await page.getByLabel("メールアドレス").fill("not-an-email");
  await page.getByLabel("パスワード", { exact: true }).fill("short");
  await page.getByLabel("パスワード（確認）").fill("different");
  await page.getByRole("button", { name: "登録する" }).click();

  await expect(page.getByText("メールアドレスの形式が正しくありません")).toBeVisible();
  await expect(page.getByText("パスワードは8文字以上で入力してください")).toBeVisible();
  await expect(page.getByText("パスワードが一致しません")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test("パスワード再設定は登録の有無にかかわらず同じメッセージを表示する", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス").fill("nobody@example.com");
  await page.getByRole("button", { name: "再設定リンクを送信" }).click();
  await expect(page.getByRole("status")).toContainText("再設定用のリンクを送信しました");
});

test("無効なリセットトークンではパスワードを変更できない", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("リンクが無効か、有効期限が切れています", { exact: false })).toBeVisible();
  await expect(page.getByLabel("新しいパスワード")).toHaveCount(0);
});
