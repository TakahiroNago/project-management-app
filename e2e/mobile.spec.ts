import { expect, test } from "@playwright/test";
import { createProject, register, waitForServerAction } from "./helpers";

test("スマートフォンでもサイドバー（ドロワー）から画面を移動し、プロジェクトを作成できる", async ({ page }) => {
  await register(page, "E2E モバイル");

  await page.getByRole("button", { name: "サイドバーを切り替え" }).click();
  await page.getByRole("link", { name: "プロジェクト" }).click();
  await expect(page).toHaveURL(/\/projects$/);

  await createProject(page, "E2E モバイルで作成");

  // 横スクロールが発生していない（レイアウト崩れの検出）
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("スマートフォンでもカンバンの列は横スクロールで表示され、ページ全体ははみ出さない", async ({ page }) => {
  await register(page, "E2E モバイルボード");
  await createProject(page, "E2E モバイルのボード");
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "ボード" }).click();

  const board = page.getByTestId("kanban-board");
  await expect(board.getByRole("region")).toHaveCount(3);
  await expect(page.getByTestId("column-TODO")).toBeInViewport();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // 列はボード内で横スクロールする
  expect(await board.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

/** CDP で実際のタッチイベントを送る（Playwright にはタッチの移動操作がないため） */
async function touchDrag(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  holdMs: number,
) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x, from.y) });
  await page.waitForTimeout(holdMs);
  const steps = 15;
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x, y) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("スマートフォンでは長押ししてからドラッグするとカードを並べ替えられ、短いスワイプでは動かない", async ({ page }) => {
  await register(page, "E2E タッチ");
  await createProject(page, "E2E タッチ操作");
  await page.getByRole("navigation", { name: "プロジェクトメニュー" }).getByRole("link", { name: "ボード" }).click();

  for (const title of ["一番目", "二番目"]) {
    await page.getByRole("button", { name: "未着手: タスクを追加" }).click();
    await page.getByRole("dialog").getByLabel("タスク名").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "作成" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  const titles = () =>
    page
      .getByTestId("column-TODO")
      .getByTestId("kanban-card")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-task-title")));
  await expect.poll(titles).toEqual(["一番目", "二番目"]);

  const first = (await page.locator('[data-task-title="一番目"]').boundingBox())!;
  const second = (await page.locator('[data-task-title="二番目"]').boundingBox())!;
  const start = { x: second.x + second.width / 2, y: second.y + second.height - 6 };
  const end = { x: first.x + first.width / 2, y: first.y + 4 };

  // 長押しせずに動かした場合（スクロール操作）はドラッグにならない
  await touchDrag(page, start, end, 0);
  await page.waitForTimeout(300);
  expect(await titles()).toEqual(["一番目", "二番目"]);

  // 長押し（200ms 以上）してから動かすとドラッグになる
  await waitForServerAction(page, () => touchDrag(page, start, end, 350));
  await expect.poll(titles).toEqual(["二番目", "一番目"]);
  await page.reload();
  await expect.poll(titles).toEqual(["二番目", "一番目"]);
});
