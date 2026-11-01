import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createProject, register } from "./helpers";

/** WCAG 2.1 A / AA の自動チェック。違反があればルール名と対象要素を表示して失敗させる */
async function expectNoA11yViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
  expect(summary, `${label} のアクセシビリティ違反`).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`アクセシビリティ（${colorScheme}）`, () => {
    test.use({ colorScheme });

    test("認証画面", async ({ page }) => {
      for (const path of ["/login", "/register", "/forgot-password", "/reset-password?error=INVALID_TOKEN"]) {
        await page.goto(path);
        await expectNoA11yViolations(page, path);
      }
    });

    test("デモのバナー", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "登録せずにデモを試す" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.waitForLoadState("networkidle");
      await expectNoA11yViolations(page, "デモのダッシュボード");
    });

    test("アプリの主要画面", async ({ page }) => {
      await register(page, `E2E a11y ${colorScheme}`);
      const projectUrl = await createProject(page, "E2E アクセシビリティ確認");

      await page.getByRole("button", { name: "タスクを追加" }).click();
      await page.getByRole("dialog").getByLabel("タスク名").fill("確認用タスク");
      await page.getByRole("dialog").getByLabel("期限").fill("2000-01-01");
      await expectNoA11yViolations(page, "タスク作成ダイアログ");
      await page.getByRole("dialog").getByRole("button", { name: "作成" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();

      const pages: [string, string][] = [
        ["/dashboard", "ダッシュボード"],
        ["/projects", "プロジェクト一覧"],
        ["/projects/new", "プロジェクト作成"],
        [projectUrl, "プロジェクト概要"],
        [`${projectUrl}/board`, "カンバン"],
        [`${projectUrl}/members`, "メンバー"],
        [`${projectUrl}/settings`, "プロジェクト設定"],
        ["/settings", "ユーザー設定"],
      ];
      for (const [url, label] of pages) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        await expectNoA11yViolations(page, label);
      }

      await page.goto(projectUrl);
      await page.getByRole("button", { name: "タスク「確認用タスク」の詳細を開く" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // ?task= への遷移でタイトルがストリーミングされるのを待ってから検査する
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveTitle(/.+/);
      await expectNoA11yViolations(page, "タスク詳細");
    });
  });
}
