import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/** ログインが必要なパス */
const PROTECTED_PATHS = ["/dashboard", "/projects", "/settings"];

function isProtected(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Content-Security-Policy。スクリプトはリクエストごとの nonce が付いたものだけを許可する（XSS 対策）。
 * スタイルは Radix UI・dnd-kit が SSR 時に style 属性を出力するため 'unsafe-inline' を許可している
 * （nonce では style 属性を許可できないため。スクリプトの実行は許可しない）。
 */
export function buildContentSecurityPolicy(nonce: string, { isDev, isHttps }: { isDev: boolean; isHttps: boolean }) {
  return [
    "default-src 'self'",
    // 開発時は React がデバッグ情報の復元に eval を使う
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // http の localhost では付けない（同一オリジンへのリクエストまで https に変えられてしまうため）
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * 1. ログインが必要なパスで、セッション Cookie が無ければログイン画面へリダイレクトする。
 *    これは楽観的チェックのみで Cookie の正当性は検証しない。認証・認可は必ずサーバー側
 *    （requireUser / サービス層）で行う。
 * 2. すべてのページに CSP を付ける。nonce は x-nonce ヘッダーでアプリに渡す。
 */
export function proxy(request: NextRequest) {
  if (isProtected(request.nextUrl.pathname) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(nonce, {
    isDev: process.env.NODE_ENV === "development",
    isHttps: request.nextUrl.protocol === "https:",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js はこのヘッダーから nonce を読み取り、自身のスクリプトに付与する
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // API・静的ファイル・リンクの先読み以外のすべてのページ
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
