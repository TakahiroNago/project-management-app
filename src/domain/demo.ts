/**
 * デモ（お試し）アカウントの規則（純粋関数）。
 *
 * ログイン画面の「デモを試す」で、訪問者ごとに一時的なユーザー（Better Auth の anonymous ユーザー）を作り、
 * サンプルデータ（架空のメンバーを含む）を用意する。期限が過ぎたら定期処理で削除する。
 */

/** デモのユーザーを削除するまでの時間。定期処理は 1 日 1 回のため、実際の削除は最長でこの 2 倍後 */
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

/** 同時に存在できるデモのユーザー数の上限（期限切れで未削除のものも含む）。DB の容量を守るため */
export const DEMO_MAX_USERS = 200;

/** デモのユーザーのメールアドレスのドメイン（.invalid は実在しないことが保証されている。RFC 2606） */
export const DEMO_EMAIL_DOMAIN = "demo.projectflow.invalid";

export type DemoUserFields = {
  id: string;
  isAnonymous: boolean;
  /** 架空のメンバーの場合、デモを開始したユーザーの ID */
  demoOwnerId: string | null;
};

/**
 * ユーザーが属するデモのグループ（デモを開始したユーザーの ID）。通常のユーザーは null。
 */
export function demoGroupOf(user: DemoUserFields): string | null {
  if (!user.isAnonymous) return null;
  return user.demoOwnerId ?? user.id;
}

/**
 * メールアドレスでメンバーに追加してよい組み合わせか。
 * - 通常のユーザーどうし: 可
 * - デモのユーザー: 同じデモのグループのユーザー（自分のサンプルデータの架空のメンバー）だけ
 *
 * デモから実在のユーザーを追加する（＝登録の有無を調べる・巻き込む）ことと、
 * 通常のユーザーが他人のデモのユーザーを追加することを防ぐ。
 */
export function canAddAsMember(actor: DemoUserFields, target: DemoUserFields): boolean {
  return demoGroupOf(actor) === demoGroupOf(target);
}

/** この時刻より前に作成されたデモのユーザーは期限切れ */
export function demoExpiryThreshold(now: Date): Date {
  return new Date(now.getTime() - DEMO_TTL_MS);
}
