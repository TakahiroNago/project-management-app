import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-1234";

export function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function register(page: Page, name: string, email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("名前").fill(name);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD);
  await page.getByLabel("パスワード（確認）").fill(PASSWORD);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { name, email };
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

export async function logout(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("プロジェクト名").fill(name);
  await page.getByRole("button", { name: "作成" }).click();
  // 作成画面（/projects/new）も /projects/<id> と同じ形のため、URL の形だけでは保存の完了を判定できない。
  // 保存が終わり、作成したプロジェクトの詳細画面へ移ったことを pathname で確認する
  await page.waitForURL((url) => isProjectDetailPath(url.pathname));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

/** プロジェクトの詳細画面（/projects/<id>）のパスか。作成画面の /projects/new は含めない */
function isProjectDetailPath(pathname: string) {
  const [, section, id, ...rest] = pathname.split("/");
  return section === "projects" && !!id && id !== "new" && rest.length === 0;
}

/**
 * 操作（action）で送信される Server Action の応答を待つ。
 * 保存の直後に再読み込み・画面移動するテストで使う。waitForLoadState("networkidle") は
 * 読み込み済みのページではすぐに返り、操作の後に始まる保存を待たないため、保存前に再読み込みしてしまうことがある。
 */
export async function waitForServerAction(page: Page, action: () => Promise<unknown>) {
  const saved = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.request().headers()["next-action"] !== undefined,
  );
  await action();
  await saved;
}

/**
 * ページで、この時点までに setTimeout で予約された処理（遅延 0）がすべて実行されるのを待つ。
 *
 * dnd-kit の KeyboardSensor は、Space でカードを持ち上げると、読み上げ（onDragStart）を同期的に出した後、
 * 矢印キーを受け付ける keydown リスナーを setTimeout で登録する（@dnd-kit/core の KeyboardSensor.attach()）。
 * そのため読み上げを確認した直後に矢印キーを送ると、タイマーの実行が遅れる環境（CI など）では
 * リスナーの登録より先にキーが届き、無視されることがある。
 *
 * HTML の仕様では、同じ遅延のタイマーは登録した順に実行される。ここで遅延 0 のタイマーを登録して
 * その実行を待てば、それより前に予約された KeyboardSensor のリスナー登録は済んでいる。
 * 一定時間待つのではなく、実行順序を利用して「予約済みの処理が終わったこと」を確認する。
 * dnd-kit がリスナーの登録方法（遅延付きのタイマーなど）を変えた場合は、この待ち方では足りなくなる。
 */
export async function waitForQueuedTimers(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}
