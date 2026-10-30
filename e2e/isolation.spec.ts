import { expect, test } from "@playwright/test";
import { createProject, logout, register } from "./helpers";

test("他のユーザーのプロジェクトは一覧に表示されず、URL を直接開いても 404 になる", async ({ page }) => {
  await register(page, "E2E アリス");
  const projectUrl = await createProject(page, "E2E アリスの非公開プロジェクト");
  await logout(page);

  await register(page, "E2E ボブ");
  await page.goto("/projects");
  await expect(page.getByText("E2E アリスの非公開プロジェクト")).toHaveCount(0);

  for (const url of [projectUrl, `${projectUrl}/settings`]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
    await expect(page.getByText("E2E アリスの非公開プロジェクト")).toHaveCount(0);
  }
});
