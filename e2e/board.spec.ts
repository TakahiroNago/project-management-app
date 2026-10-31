import { expect, type Locator, type Page, test } from "@playwright/test";
import { createProject, register, waitForServerAction } from "./helpers";

const column = (page: Page, status: "TODO" | "IN_PROGRESS" | "DONE") => page.getByTestId(`column-${status}`);
const card = (page: Page, title: string) => page.locator(`[data-testid="kanban-card"][data-task-title="${title}"]`);
const titlesIn = (col: Locator) => col.getByTestId("kanban-card").evaluateAll((els) => els.map((el) => el.getAttribute("data-task-title")));

async function addTask(page: Page, status: "TODO" | "IN_PROGRESS" | "DONE", title: string, dueDate?: string) {
  const label = { TODO: "未着手", IN_PROGRESS: "進行中", DONE: "完了" }[status];
  await page.getByRole("button", { name: `${label}: タスクを追加` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("タスク名").fill(title);
  if (dueDate) await dialog.getByLabel("期限").fill(dueDate);
  await dialog.getByRole("button", { name: "作成" }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, title)).toBeVisible();
}

/** マウスでドラッグ＆ドロップする（dnd-kit は 6px 以上動かすとドラッグ開始） */
async function dragTo(page: Page, source: Locator, target: Locator, position: "center" | "top" = "center") {
  // ストリーミング中は隠し要素として先に挿入されるため、表示されるのを待ってから位置を取る
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height - 8;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, position === "top" ? to.y + 4 : to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

async function openBoard(page: Page) {
  await register(page, "E2E カンバン");
  await createProject(page, "E2E カンバンのプロジェクト");
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "ボード" }).click();
  await expect(page.getByTestId("kanban-board")).toBeVisible();
}

test("ドラッグ＆ドロップで列を移動・並べ替えでき、再読み込み後も保持される", async ({ page }) => {
  await openBoard(page);
  await addTask(page, "TODO", "タスクA");
  await addTask(page, "TODO", "タスクB");
  await addTask(page, "TODO", "タスクC");
  expect(await titlesIn(column(page, "TODO"))).toEqual(["タスクA", "タスクB", "タスクC"]);

  // 列間の移動（空の列へ）
  await waitForServerAction(page, () => dragTo(page, card(page, "タスクA"), column(page, "IN_PROGRESS")));
  await expect(column(page, "IN_PROGRESS").getByTestId("kanban-card")).toHaveCount(1);
  expect(await titlesIn(column(page, "TODO"))).toEqual(["タスクB", "タスクC"]);

  // 列内の並べ替え（C を B の上へ）
  await waitForServerAction(page, () => dragTo(page, card(page, "タスクC"), card(page, "タスクB"), "top"));
  await expect.poll(() => titlesIn(column(page, "TODO"))).toEqual(["タスクC", "タスクB"]);

  // サーバーに保存されている
  await page.reload();
  await expect.poll(() => titlesIn(column(page, "TODO"))).toEqual(["タスクC", "タスクB"]);
  expect(await titlesIn(column(page, "IN_PROGRESS"))).toEqual(["タスクA"]);

  // 完了列へ移動すると進捗率に反映される
  await waitForServerAction(page, () => dragTo(page, card(page, "タスクA"), column(page, "DONE")));
  await expect(column(page, "DONE").getByTestId("kanban-card")).toHaveCount(1);
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "概要" }).click();
  await expect(page.getByText("1 / 3 タスク完了")).toBeVisible();
});

test("キーボードだけでカードを別の列へ移動できる", async ({ page }) => {
  await openBoard(page);
  await addTask(page, "TODO", "キーボードで移動");

  // 各操作はスクリーンリーダー向けの読み上げで完了を確認してから次へ進む
  const announcer = page.getByRole("status").filter({ hasText: "キーボードで移動" });
  await page.getByRole("button", { name: "タスク「キーボードで移動」を移動" }).focus();
  await page.keyboard.press("Space");
  await expect(announcer).toContainText(/持ち上げました（未着手、1番目）|未着手の1番目に移動中/);
  await page.keyboard.press("ArrowRight");
  await expect(announcer).toContainText("進行中の1番目に移動中");
  await waitForServerAction(page, () => page.keyboard.press("Space"));
  await expect(announcer).toContainText("進行中の1番目に移動しました");

  await expect(column(page, "IN_PROGRESS").getByTestId("kanban-card")).toHaveCount(1);
  await page.reload();
  expect(await titlesIn(column(page, "IN_PROGRESS"))).toEqual(["キーボードで移動"]);
});

test("カードからタスク詳細を開き、編集・削除できる", async ({ page }) => {
  await openBoard(page);
  await addTask(page, "TODO", "詳細を見るタスク", "2000-01-01");
  await expect(card(page, "詳細を見るタスク")).toContainText("期限切れ");

  await page.getByRole("button", { name: "タスク「詳細を見るタスク」の詳細を開く" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "詳細を見るタスク" })).toBeVisible();
  await expect(dialog).toContainText("未割り当て");

  await dialog.getByRole("button", { name: "編集" }).click();
  await page.getByRole("dialog").getByLabel("ステータス").click();
  await page.getByRole("option", { name: "完了" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "保存" }).click();
  await expect(column(page, "DONE").getByTestId("kanban-card")).toHaveCount(1);
  await expect(card(page, "詳細を見るタスク")).not.toContainText("期限切れ");

  await page.getByRole("button", { name: "タスク「詳細を見るタスク」の詳細を開く" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByTestId("kanban-card")).toHaveCount(0);
});
