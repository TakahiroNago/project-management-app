import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 楽観的チェックのみ：セッション Cookie が無ければログイン画面へリダイレクトする。
 * Cookie の正当性は検証しないため、認証・認可は必ずサーバー側（requireUser / サービス層）で行う。
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/settings/:path*"],
};
