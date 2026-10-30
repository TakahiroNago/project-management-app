import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./proxy";

const directives = (csp: string) =>
  Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]));

describe("buildContentSecurityPolicy", () => {
  it("スクリプトは nonce 付きのみ許可し、unsafe-inline / unsafe-eval を含まない（本番）", () => {
    const csp = directives(buildContentSecurityPolicy("abc123", { isDev: false, isHttps: true }));
    expect(csp["script-src"]).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp["script-src"]).not.toContain("unsafe");
  });

  it("フレーム埋め込み・プラグイン・base タグの書き換え・外部へのフォーム送信を禁止する", () => {
    const csp = directives(buildContentSecurityPolicy("n", { isDev: false, isHttps: true }));
    expect(csp["frame-ancestors"]).toBe("'none'");
    expect(csp["object-src"]).toBe("'none'");
    expect(csp["base-uri"]).toBe("'self'");
    expect(csp["form-action"]).toBe("'self'");
    expect(csp["default-src"]).toBe("'self'");
  });

  it("開発時のみ unsafe-eval を許可する", () => {
    expect(buildContentSecurityPolicy("n", { isDev: true, isHttps: false })).toContain("'unsafe-eval'");
  });

  it("https のときだけ upgrade-insecure-requests を付ける", () => {
    expect(buildContentSecurityPolicy("n", { isDev: false, isHttps: true })).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy("n", { isDev: false, isHttps: false })).not.toContain(
      "upgrade-insecure-requests",
    );
  });
});
