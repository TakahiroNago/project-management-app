import "server-only";
import { can, type ProjectPermission, type ProjectRole } from "@/domain/permissions";
import type { DbClient } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/** ユーザーのプロジェクト内ロールを返す（メンバーでなければ null） */
export async function getProjectRole(
  client: DbClient,
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const membership = await client.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * プロジェクトに対する操作権限を検証する。
 * - メンバーでない（またはプロジェクトが存在しない）: NotFoundError（存在自体を隠す）
 * - メンバーだが権限がない: ForbiddenError
 *
 * 更新系ではトランザクションクライアントを渡し、検証と更新を同一トランザクションで行う。
 */
export async function authorizeProject(
  client: DbClient,
  { projectId, userId, permission }: { projectId: string; userId: string; permission: ProjectPermission },
): Promise<ProjectRole> {
  const role = await getProjectRole(client, projectId, userId);
  if (!role) throw new NotFoundError();
  if (!can(role, permission)) throw new ForbiddenError();
  return role;
}
