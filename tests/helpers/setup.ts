import { afterAll, beforeEach, vi } from "vitest";
import { resetDatabase } from "./db";

// Server Action 内の revalidatePath はリクエスト外では使えないため無効化する
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

// after() はリクエスト外では使えないため、バックグラウンド処理はテスト側で待てるよう記録する
vi.mock("@/lib/background", async () => {
  const { backgroundTasks } = await import("./background");
  return {
    runInBackground: (task: Promise<unknown>) => {
      backgroundTasks.push(task);
    },
  };
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
});
