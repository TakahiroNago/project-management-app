/**
 * プロジェクト内の権限判定（純粋関数）。
 * Prisma の enum と同じ文字列リテラルを使うが、フレームワーク・DB には依存しない。
 */
export type ProjectRole = "OWNER" | "MEMBER";

const ALL: readonly ProjectRole[] = ["OWNER", "MEMBER"];
const OWNER_ONLY: readonly ProjectRole[] = ["OWNER"];

/** 操作ごとに許可されるロール（要件 3.6 の権限表に対応） */
export const PROJECT_PERMISSIONS = {
  "project:view": ALL,
  "project:update": OWNER_ONLY,
  "project:delete": OWNER_ONLY,
  "member:view": ALL,
  "member:manage": OWNER_ONLY,
  "task:view": ALL,
  "task:create": ALL,
  "task:update": ALL,
  "task:delete": ALL,
  // コメントの編集・削除は権限ではなく「投稿者本人か」で判定する（サービス層）
  "comment:view": ALL,
  "comment:create": ALL,
} as const satisfies Record<string, readonly ProjectRole[]>;

export type ProjectPermission = keyof typeof PROJECT_PERMISSIONS;

/**
 * ロールが操作を許可されているかを判定する。
 * role が null（＝プロジェクトのメンバーではない）の場合は常に false。
 */
export function can(role: ProjectRole | null | undefined, permission: ProjectPermission): boolean {
  if (!role) return false;
  return (PROJECT_PERMISSIONS[permission] as readonly ProjectRole[]).includes(role);
}
