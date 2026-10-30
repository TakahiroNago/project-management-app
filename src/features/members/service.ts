import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { lockProject, recordActivity } from "@/features/tasks/service";
import { m } from "@/i18n";
import { authorizeProject } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

/** 登録済みユーザーをメールアドレスで MEMBER として追加する（Owner のみ） */
export async function addMember(actorId: string, projectId: string, email: string) {
  try {
    return await db.$transaction(async (tx) => {
      await authorizeProject(tx, { projectId, userId: actorId, permission: "member:manage" });

      const user = await tx.user.findUnique({ where: { email }, select: { id: true, name: true } });
      if (!user) throw new ValidationError(m.member.userNotFound, { email: [m.member.userNotFound] });

      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
        select: { id: true },
      });
      if (existing) throw new ValidationError(m.member.alreadyMember, { email: [m.member.alreadyMember] });

      await tx.projectMember.create({ data: { projectId, userId: user.id, role: "MEMBER" } });
      return user;
    });
  } catch (error) {
    // 同時に同じユーザーを追加した場合は一意制約違反になる
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError(m.member.alreadyMember, { email: [m.member.alreadyMember] });
    }
    throw error;
  }
}

/**
 * メンバーを削除する（Owner のみ。Owner 自身は削除できない）。
 * 同一トランザクションで、そのメンバーが担当しているタスクを「未割り当て」に戻し、履歴にも残す。
 * プロジェクト行をロックするため、並行して行われる担当者の設定とは直列に処理される。
 */
export async function removeMember(actorId: string, projectId: string, memberUserId: string) {
  return db.$transaction(async (tx) => {
    await authorizeProject(tx, { projectId, userId: actorId, permission: "member:manage" });
    await lockProject(tx, projectId);

    const membership = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      select: { id: true, role: true, user: { select: { name: true } } },
    });
    if (!membership) throw new NotFoundError();
    if (membership.role === "OWNER") throw new ValidationError(m.member.cannotRemoveOwner);

    const assigned = await tx.task.findMany({
      where: { projectId, assigneeId: memberUserId },
      select: { id: true },
    });
    await tx.task.updateMany({
      where: { projectId, assigneeId: memberUserId },
      data: { assigneeId: null },
    });
    for (const task of assigned) {
      await recordActivity(tx, {
        projectId,
        taskId: task.id,
        userId: actorId,
        changes: [{ action: "ASSIGNEE_CHANGED", oldValue: memberUserId, newValue: null }],
      });
    }

    await tx.projectMember.delete({ where: { id: membership.id } });
    return { name: membership.user.name, unassignedTaskCount: assigned.length };
  });
}
