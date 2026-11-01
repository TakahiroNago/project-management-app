import { expect, test } from "@playwright/test";
import { logout } from "./helpers";

test("ログイン画面からデモを開始し、サンプルデータで操作できる", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "登録せずにデモを試す" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByText("ようこそ、ゲスト さん")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "デモアカウントでログインしています" })).toBeVisible();

  // サンプルのプロジェクトのカンバン（期限切れのタスクを含む）
  await page.goto("/projects");
  await page.getByRole("link", { name: "コーポレートサイト リニューアル" }).click();
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "ボード" }).click();
  const board = page.getByTestId("kanban-board");
  await expect(board.getByTestId("kanban-card").filter({ hasText: "トップページのデザイン" })).toBeVisible();
  await expect(board.getByTestId("kanban-card")).toHaveCount(7);

  // パスワードは変更できない
  await page.goto("/settings");
  await expect(page.getByText("デモアカウントにはパスワードがないため")).toBeVisible();
  await expect(page.getByLabel("現在のパスワード")).toHaveCount(0);

  await logout(page);
});
