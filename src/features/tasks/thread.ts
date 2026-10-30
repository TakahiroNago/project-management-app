import "server-only";
import { authorizeProject } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

/**
 * タスク詳細に表示するコメントと更新履歴。
 * URL の ?task=<id> から呼ばれるため、タスクが指定プロジェクトに属し、かつユーザーがメンバーである場合のみ返す
 * （それ以外は null。他プロジェクトのタスク ID を指定しても何も表示しない）。
 */
export async function getTaskThread(userId: string, projectId: string, taskId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
  if (!task) return null;
  await authorizeProject(db, { projectId, userId, permission: "comment:view" });

  const [comments, logs] = await Promise.all([
    db.comment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    db.activityLog.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        action: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  // 担当者の変更履歴はユーザー ID で記録しているため、表示名を解決する（プロジェクトを抜けたユーザーも含む）
  const assigneeIds = [
    ...new Set(
      logs
        .filter((log) => log.action === "ASSIGNEE_CHANGED")
        .flatMap((log) => [log.oldValue, log.newValue])
        .filter((id): id is string => !!id),
    ),
  ];
  const users = assigneeIds.length
    ? await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
    : [];

  return {
    taskId,
    comments,
    activity: logs,
    userNames: Object.fromEntries(users.map((user) => [user.id, user.name])) as Record<string, string>,
  };
}

export type TaskThread = NonNullable<Awaited<ReturnType<typeof getTaskThread>>>;
