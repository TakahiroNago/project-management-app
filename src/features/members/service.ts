import "server-only";
import { canAddAsMember } from "@/domain/demo";
import { Prisma } from "@/generated/prisma/client";
import { lockProject } from "@/features/tasks/service";
import { m } from "@/i18n";
import { authorizeProject } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

const DEMO_FIELDS = { id: true, isAnonymous: true, demoOwnerId: true } as const;

/**
 * 登録済みユーザーをメールアドレスで MEMBER として追加する（Owner のみ）。
 * デモのユーザーは自分のデモの架空のメンバーだけを、通常のユーザーは通常のユーザーだけを追加できる。
 * 追加できない組み合わせは「見つからない」と同じ応答にする（登録の有無を推測させない）。
 */
export async function addMember(actorId: string, projectId: string, email: string) {
  try {
    return await db.$transaction(async (tx) => {
      await authorizeProject(tx, { projectId, userId: actorId, permission: "member:manage" });

      const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: DEMO_FIELDS });
      const user = await tx.user.findUnique({ where: { email }, select: { ...DEMO_FIELDS, name: true } });
      if (!user || !canAddAsMember(actor, user)) {
        throw new ValidationError(m.member.userNotFound, { email: [m.member.userNotFound] });
      }

      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
        select: { id: true },
      });
      if (existing) throw new ValidationError(m.member.alreadyMember, { email: [m.member.alreadyMember] });

      await tx.projectMember.create({ data: { projectId, userId: user.id, role: "MEMBER" } });
      return { id: user.id, name: user.name };
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

    // 担当タスクの数によらず、更新と履歴の記録をそれぞれ 1 回のクエリで行う（DB との往復を増やさない）
    const assigned = await tx.task.updateManyAndReturn({
      where: { projectId, assigneeId: memberUserId },
      data: { assigneeId: null },
      select: { id: true },
    });
    if (assigned.length > 0) {
      await tx.activityLog.createMany({
        data: assigned.map((task) => ({
          projectId,
          taskId: task.id,
          userId: actorId,
          action: "ASSIGNEE_CHANGED" as const,
          oldValue: memberUserId,
          newValue: null,
        })),
      });
    }

    await tx.projectMember.delete({ where: { id: membership.id } });
    return { name: membership.user.name, unassignedTaskCount: assigned.length };
  });
}
