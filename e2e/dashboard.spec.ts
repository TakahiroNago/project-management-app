import { expect, test } from "@playwright/test";
import { createProject, register } from "./helpers";

test("ダッシュボードに集計・直近のタスク・進捗率が表示される", async ({ page }) => {
  await register(page, "E2E ダッシュボード");
  await expect(page.getByTestId("stat-totalProjects")).toContainText("0");
  await expect(page.getByText("プロジェクトがありません")).toBeVisible();

  await createProject(page, "E2E 集計対象");
  const addTask = async (title: string, dueDate: string) => {
    await page.getByRole("button", { name: "タスクを追加" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("タスク名").fill(title);
    await dialog.getByLabel("期限").fill(dueDate);
    await dialog.getByRole("button", { name: "作成" }).click();
    await expect(dialog).toBeHidden();
  };
  await addTask("過去が期限のタスク", "2000-01-01");
  await addTask("未来が期限のタスク", "2099-12-31");

  await page.getByRole("link", { name: "ダッシュボード" }).click();
  await expect(page.getByTestId("stat-totalProjects")).toContainText("1");
  await expect(page.getByTestId("stat-openTasks")).toContainText("2");
  await expect(page.getByTestId("stat-overdueTasks")).toContainText("1");

  const recent = page.getByTestId("recent-tasks").getByRole("listitem");
  await expect(recent).toHaveCount(2);
  await expect(recent.first()).toContainText("過去が期限のタスク");
  await expect(recent.first()).toContainText("期限切れ");

  await expect(page.getByTestId("project-progress")).toContainText("E2E 集計対象");
  await expect(page.getByTestId("project-progress")).toContainText("0 / 2 タスク完了");

  // 直近のタスクからボードへ移動できる
  await recent.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board$/);
});
