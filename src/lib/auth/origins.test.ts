import { describe, expect, it } from "vitest";
import { resolveAuthOrigins } from "./origins";

describe("resolveAuthOrigins", () => {
  it("本番は BETTER_AUTH_URL だけを使い、追加のオリジンを信頼しない", () => {
    expect(
      resolveAuthOrigins({
        VERCEL_ENV: "production",
        BETTER_AUTH_URL: "https://projectflow.art-full-stack.com",
        VERCEL_URL: "projectflow-abc123-team.vercel.app",
      }),
    ).toEqual({ baseURL: "https://projectflow.art-full-stack.com", trustedOrigins: [] });
  });

  it("ローカルは BETTER_AUTH_URL を使う", () => {
    expect(resolveAuthOrigins({ BETTER_AUTH_URL: "http://localhost:3000" })).toEqual({
      baseURL: "http://localhost:3000",
      trustedOrigins: [],
    });
  });

  it("Preview はそのデプロイのブランチ URL とデプロイ URL だけを信頼し、ブランチ URL を基準にする", () => {
    expect(
      resolveAuthOrigins({
        VERCEL_ENV: "preview",
        VERCEL_URL: "projectflow-abc123-team.vercel.app",
        VERCEL_BRANCH_URL: "projectflow-git-feature-team.vercel.app",
      }),
    ).toEqual({
      baseURL: "https://projectflow-git-feature-team.vercel.app",
      trustedOrigins: ["https://projectflow-git-feature-team.vercel.app", "https://projectflow-abc123-team.vercel.app"],
    });
  });

  it("Preview でブランチ URL が無い場合（CLI でのデプロイなど）はデプロイ URL を使う", () => {
    expect(resolveAuthOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "projectflow-abc123-team.vercel.app" })).toEqual({
      baseURL: "https://projectflow-abc123-team.vercel.app",
      trustedOrigins: ["https://projectflow-abc123-team.vercel.app"],
    });
  });

  it("Preview では BETTER_AUTH_URL（本番 URL）が設定されていても使わず、ワイルドカードも含めない", () => {
    const { baseURL, trustedOrigins } = resolveAuthOrigins({
      VERCEL_ENV: "preview",
      BETTER_AUTH_URL: "https://projectflow.art-full-stack.com",
      VERCEL_URL: "projectflow-abc123-team.vercel.app",
    });
    expect(baseURL).not.toContain("art-full-stack.com");
    expect(trustedOrigins.some((origin) => origin.includes("*"))).toBe(false);
  });
});
