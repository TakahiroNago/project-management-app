import { expect, test } from "@playwright/test";
import { createProject, register } from "./helpers";

test("すべてのページに nonce 付きの CSP が設定され、リクエストごとに nonce が変わる", async ({ request }) => {
  const nonces = new Set<string>();
  for (const path of ["/login", "/register", "/login"]) {
    const response = await request.get(path);
    const csp = response.headers()["content-security-policy"];
    expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-powered-by"]).toBeUndefined();
    nonces.add(/'nonce-([^']+)'/.exec(csp)![1]);
  }
  expect(nonces.size).toBe(3);
});

test("アプリ自身は CSP 違反を起こさず、nonce のないインラインスクリプトは実行されない", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  page.on("pageerror", (error) => violations.push(error.message));

  await register(page, "E2E CSP");
  const projectUrl = await createProject(page, "E2E CSP 確認");
  for (const url of ["/dashboard", "/projects", `${projectUrl}/board`, `${projectUrl}/members`, "/settings"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
  }
  // テーマ切替（next-themes のスクリプト）も動作する
  await page.getByRole("button", { name: "テーマ" }).click();
  await page.getByRole("menuitemradio", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(violations).toEqual([]);

  // 攻撃者がマークアップを挿入できた場合を想定（典型的な XSS の手口）: イベントハンドラ属性は CSP で実行されない
  // （strict-dynamic のため、正規のスクリプトが createElement で作るスクリプトは許可される。これは仕様どおり）
  const executed = await page.evaluate(async () => {
    const w = window as unknown as { injected?: boolean };
    w.injected = false;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<img src="data:," alt="" onload="window.injected = true" onerror="window.injected = true">`,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    return w.injected;
  });
  expect(executed).toBe(false);
});
