import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { assertServerEnv, getDeploymentEnv } from "./src/lib/env";

const securityHeaders = [
  // クリックジャッキング対策
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // 全画面がログインユーザー固有のデータで構成されるため、Cache Components は使わない
  // （判断理由は docs/design.md「3.3 主要な設計判断」を参照）
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default function config(phase: string): NextConfig {
  // Vercel の Production / Preview では、環境変数の検証（src/lib/env.ts）をビルド時にも行う。
  // 起動時（src/instrumentation.ts）だけだと、誤った設定のデプロイが本番に切り替わってからサイト全体が止まるが、
  // ビルドで失敗させれば切り替わらず、それまでの本番デプロイが動き続ける
  if (phase === PHASE_PRODUCTION_BUILD && getDeploymentEnv(process.env) !== "local") {
    assertServerEnv(process.env);
  }
  return nextConfig;
}
