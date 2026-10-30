import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ quiet: true });

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // server-only は React Server 環境以外で import すると例外を投げるため、テストでは空モジュールに置き換える
  "server-only": path.resolve(import.meta.dirname, "tests/helpers/empty-module.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // UI（shadcn の生成物・画面）は E2E で確認するため、単体・統合テストのカバレッジ対象から外す
      exclude: ["src/generated/**", "src/components/**", "src/app/**", "src/**/components/**", "src/hooks/**", "src/**/*.test.ts"],
      reporter: ["text-summary", "text", "html"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/helpers/global-setup.ts"],
          setupFiles: ["tests/helpers/setup.ts"],
          // 全テストで同じテスト用 DB を使うため、ファイル単位でも直列に実行する
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
            BETTER_AUTH_URL: "http://localhost:3000",
            BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "test-secret-test-secret-test-secret",
            RESEND_API_KEY: "",
          },
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
