import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-1234";

export function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function register(page: Page, name: string, email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("名前").fill(name);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD);
  await page.getByLabel("パスワード（確認）").fill(PASSWORD);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { name, email };
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

export async function logout(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("プロジェクト名").fill(name);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

/**
 * 操作（action）で送信される Server Action の応答を待つ。
 * 保存の直後に再読み込み・画面移動するテストで使う。waitForLoadState("networkidle") は
 * 読み込み済みのページではすぐに返り、操作の後に始まる保存を待たないため、保存前に再読み込みしてしまうことがある。
 */
export async function waitForServerAction(page: Page, action: () => Promise<unknown>) {
  const saved = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.request().headers()["next-action"] !== undefined,
  );
  await action();
  await saved;
}
