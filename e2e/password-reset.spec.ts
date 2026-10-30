import { expect, test } from "@playwright/test";
import { latestResetToken } from "./db";
import { login, PASSWORD, register } from "./helpers";

const NEW_PASSWORD = "e2e-new-password-5678";

test("パスワード再設定: メールのリンクから新しいパスワードを設定でき、他の端末のログインは無効になる", async ({
  page,
  browser,
}) => {
  const user = await register(page, "E2E 再設定");

  // 別の端末（ブラウザコンテキスト）でもログインしておく
  const otherDevice = await browser.newContext();
  const otherPage = await otherDevice.newPage();
  await login(otherPage, user.email);
  await expect(otherPage).toHaveURL(/\/dashboard$/);

  // パスワードを忘れた → 再設定メールを要求
  await page.context().clearCookies();
  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス").fill(user.email);
  await page.getByRole("button", { name: "再設定リンクを送信" }).click();
  await expect(page.getByRole("status")).toContainText("再設定用のリンクを送信しました");

  // メールに記載されるリンク（/api/auth/reset-password/<token>?callbackURL=/reset-password）を開く
  const token = await latestResetToken(user.email);
  await page.goto(`/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/reset-password")}`);
  await expect(page).toHaveURL(/\/reset-password\?token=/);

  await page.getByLabel("新しいパスワード").fill(NEW_PASSWORD);
  await page.getByLabel("パスワード（確認）").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  await expect(page.getByRole("status")).toContainText("パスワードを変更しました");

  // 他の端末のセッションは無効になっている
  await otherPage.goto("/projects");
  await expect(otherPage).toHaveURL(/\/login$/);
  await otherDevice.close();

  // 旧パスワードではログインできず、新パスワードでログインできる
  await login(page, user.email, PASSWORD);
  await expect(page.getByText("メールアドレスまたはパスワードが正しくありません")).toBeVisible();
  await login(page, user.email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  // 同じリンクは再利用できない（使い捨て）
  await page.context().clearCookies();
  await page.goto(`/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/reset-password")}`);
  await expect(page.getByText("リンクが無効か、有効期限が切れています", { exact: false })).toBeVisible();
});
