import { expect, test } from "@playwright/test";
import { createProject, register } from "./helpers";

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
