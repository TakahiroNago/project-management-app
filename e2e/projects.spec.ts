import { expect, test } from "@playwright/test";
import { createProject, register } from "./helpers";

test("プロジェクトとタスクの作成・編集・完了・削除", async ({ page }) => {
  await register(page, "E2E プロジェクト担当");
  await createProject(page, "E2E ウェブサイト制作");

  // タスク作成
  await page.getByRole("button", { name: "タスクを追加" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("タスク名").fill("ワイヤーフレーム作成");
  await dialog.getByLabel("期限").fill("2099-12-31");
  await dialog.getByRole("button", { name: "作成" }).click();
  await expect(dialog).toBeHidden();

  const taskList = page.getByTestId("task-list");
  await expect(taskList.getByText("ワイヤーフレーム作成")).toBeVisible();
  await expect(page.getByText("0 / 1 タスク完了")).toBeVisible();

  // タスクを完了にする（担当者に自分を設定）
  await page.getByRole("button", { name: "操作: ワイヤーフレーム作成" }).click();
  await page.getByRole("menuitem", { name: "編集" }).click();
  await dialog.getByLabel("ステータス").click();
  await page.getByRole("option", { name: "完了" }).click();
  await dialog.getByLabel("担当者").click();
  await page.getByRole("option", { name: "E2E プロジェクト担当" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText("1 / 1 タスク完了")).toBeVisible();
  await expect(taskList.getByText("E2E プロジェクト担当")).toBeVisible();

  // 一覧にも進捗が反映される
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: /E2E ウェブサイト制作/ })).toContainText("100%");

  // タスク削除
  await page.getByRole("link", { name: /E2E ウェブサイト制作/ }).click();
  await page.getByRole("button", { name: "操作: ワイヤーフレーム作成" }).click();
  await page.getByRole("menuitem", { name: "削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByText("タスクがありません")).toBeVisible();
});

test("プロジェクトの編集・検索・削除（確認ダイアログあり）", async ({ page }) => {
  await register(page, "E2E オーナー");
  await createProject(page, "E2E 旧プロジェクト名");

  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "設定" }).click();
  await page.getByLabel("プロジェクト名").fill("E2E 新プロジェクト名");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E 新プロジェクト名" })).toBeVisible();

  // 検索
  await createProject(page, "E2E 別のプロジェクト");
  await page.goto("/projects");
  await page.getByRole("searchbox", { name: "検索" }).fill("新プロジェクト");
  await page.getByRole("searchbox", { name: "検索" }).press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("link", { name: /E2E 新プロジェクト名/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /E2E 別のプロジェクト/ })).toHaveCount(0);

  // 削除（キャンセル → 実行）
  await page.getByRole("link", { name: /E2E 新プロジェクト名/ }).click();
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "設定" }).click();
  await page.getByRole("button", { name: "プロジェクトを削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();

  await page.getByRole("button", { name: "プロジェクトを削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name: /E2E 新プロジェクト名/ })).toHaveCount(0);
});
