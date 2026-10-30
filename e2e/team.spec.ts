import { expect, type Page, test } from "@playwright/test";
import { createProject, login, logout, register } from "./helpers";

const projectNav = (page: Page) => page.getByRole("navigation", { name: "プロジェクトメニュー" });

test("Owner がメンバーを追加し、メンバーがタスクにコメント・担当でき、削除後はアクセスできなくなる", async ({ page }) => {
  // メンバーになるユーザーを先に登録しておく
  const member = await register(page, "E2E メンバー");
  await logout(page);

  const owner = await register(page, "E2E オーナー");
  const projectUrl = await createProject(page, "E2E チームプロジェクト");

  // タスクを作成
  await page.getByRole("button", { name: "タスクを追加" }).click();
  await page.getByRole("dialog").getByLabel("タスク名").fill("共同作業のタスク");
  await page.getByRole("dialog").getByRole("button", { name: "作成" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // メンバー追加（未登録のメールはエラー）
  await projectNav(page).getByRole("link", { name: "メンバー" }).click();
  await page.getByPlaceholder("メールアドレス").fill("nobody@example.com");
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByText("このメールアドレスのユーザーは見つかりません", { exact: false })).toBeVisible();

  await page.getByPlaceholder("メールアドレス").fill(member.email);
  await page.getByRole("button", { name: "追加" }).click();
  await expect(page.getByTestId("member-list")).toContainText("E2E メンバー");
  await expect(page.getByTestId("member-list")).toContainText("Member");

  // オーナーがコメント
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "タスク「共同作業のタスク」の詳細を開く" }).click();
  await expect(page).toHaveURL(/\?task=/);
  await page.getByRole("dialog").getByRole("textbox", { name: "コメント", exact: true }).fill("よろしくお願いします");
  await page.getByRole("dialog").getByRole("button", { name: "コメントする" }).click();
  await expect(page.getByRole("dialog").getByTestId("comment")).toHaveCount(1);
  // Esc で詳細を閉じると URL からも ?task が消える
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).not.toHaveURL(/[?]task=/);
  await logout(page);

  // メンバーとしてログイン
  await login(page, member.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(projectUrl);
  await expect(page.getByRole("heading", { level: 1, name: "E2E チームプロジェクト" })).toBeVisible();
  // Member には設定タブが表示されず、メンバー画面に追加フォームもない
  await expect(projectNav(page).getByRole("link", { name: "設定" })).toHaveCount(0);
  await projectNav(page).getByRole("link", { name: "メンバー" }).click();
  await expect(page.getByRole("button", { name: "追加" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /削除/ })).toHaveCount(0);

  // 自分を担当者にしてステータスを変更
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "操作: 共同作業のタスク" }).click();
  await page.getByRole("menuitem", { name: "編集" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("担当者").click();
  await page.getByRole("option", { name: "E2E メンバー" }).click();
  await form.getByLabel("ステータス").click();
  await page.getByRole("option", { name: "進行中" }).click();
  await form.getByRole("button", { name: "保存" }).click();
  await expect(form).toBeHidden();

  // 詳細: 他人のコメントは操作できず、自分のコメントは編集・削除できる。履歴が表示される
  await page.getByRole("button", { name: "タスク「共同作業のタスク」の詳細を開く" }).click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("button", { name: "E2E オーナー さんのコメントの操作" })).toHaveCount(0);

  await detail.getByRole("textbox", { name: "コメント", exact: true }).fill("担当します");
  await detail.getByRole("button", { name: "コメントする" }).click();
  await expect(detail.getByTestId("comment")).toHaveCount(2);

  await detail.getByRole("button", { name: "E2E メンバー さんのコメントの操作" }).click();
  await page.getByRole("menuitem", { name: "編集" }).click();
  await detail.getByTestId("comment").nth(1).getByRole("textbox").fill("担当します（明日着手）");
  await detail.getByRole("button", { name: "保存" }).click();
  await expect(detail.getByTestId("comment").nth(1)).toContainText("担当します（明日着手）");
  await expect(detail.getByTestId("comment").nth(1)).toContainText("（編集済み）");

  const activity = detail.getByTestId("activity");
  await expect(activity).toContainText("E2E メンバー さんがステータスを「未着手」から「進行中」に変更しました");
  await expect(activity).toContainText("E2E メンバー さんが担当者を「未設定」から「E2E メンバー」に変更しました");
  await expect(activity).toContainText("E2E オーナー さんがタスクを作成しました");

  await detail.getByRole("button", { name: "E2E メンバー さんのコメントの操作" }).click();
  await page.getByRole("menuitem", { name: "削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(detail.getByTestId("comment")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await logout(page);

  // Owner がメンバーを削除すると、担当は未割り当てに戻る
  await login(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`${projectUrl}/members`);
  await page.getByRole("button", { name: "E2E メンバー: 削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByTestId("member-list")).not.toContainText("E2E メンバー");
  await page.goto(projectUrl);
  await expect(page.getByTestId("task-list")).toContainText("未割り当て");
  await logout(page);

  // 削除されたメンバーはアクセスできない
  await login(page, member.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  const response = await page.goto(projectUrl);
  expect(response?.status()).toBe(404);
});

test("タスク詳細の URL は共有でき、別プロジェクトのタスク ID を指定しても表示されない", async ({ page }) => {
  await register(page, "E2E URL 共有");
  const projectA = await createProject(page, "E2E プロジェクトA");
  await page.getByRole("button", { name: "タスクを追加" }).click();
  await page.getByRole("dialog").getByLabel("タスク名").fill("A のタスク");
  await page.getByRole("dialog").getByRole("button", { name: "作成" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "タスク「A のタスク」の詳細を開く" }).click();
  await expect(page).toHaveURL(/\?task=/);
  const taskId = new URL(page.url()).searchParams.get("task");

  // 直接 URL を開いても詳細が表示される（ボードでも同じ）
  await page.goto(`${projectA}/board?task=${taskId}`);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "A のタスク" })).toBeVisible();

  // 別プロジェクトの URL にタスク ID を付けても表示されない
  const projectB = await createProject(page, "E2E プロジェクトB");
  await page.goto(`${projectB}?task=${taskId}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E プロジェクトB" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
