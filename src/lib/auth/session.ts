import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { UnauthorizedError } from "@/lib/errors";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  /** デモ（お試し）のユーザーか */
  isDemo: boolean;
};

/**
 * 現在のセッションを DB で検証して取得する（同一リクエスト内では 1 回だけ問い合わせる）。
 * Cookie の有無だけを見る proxy.ts とは異なり、こちらが本当の認証チェック。
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, isAnonymous } = session.user;
  return { id, name, email, isDemo: isAnonymous === true };
});

/** ページ・レイアウト用。未ログインならログイン画面へリダイレクトする */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Server Action 用。未ログインなら UnauthorizedError を投げる */
export async function requireActionUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
