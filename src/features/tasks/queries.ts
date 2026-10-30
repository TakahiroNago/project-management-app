import "server-only";
import { authorizeProject } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

/** プロジェクトのタスク一覧（ステータス → 並び順）。メンバーでなければ NotFoundError */
export async function listTasksForProject(userId: string, projectId: string) {
  await authorizeProject(db, { projectId, userId, permission: "task:view" });
  return db.task.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      startDate: true,
      dueDate: true,
      assignee: { select: { id: true, name: true } },
    },
  });
}

export type TaskListItem = Awaited<ReturnType<typeof listTasksForProject>>[number];

/** 担当者の選択肢（プロジェクトのメンバー）。メンバーでなければ NotFoundError */
export async function listAssignableMembers(userId: string, projectId: string) {
  await authorizeProject(db, { projectId, userId, permission: "member:view" });
  const members = await db.projectMember.findMany({
    where: { projectId },
    orderBy: { joinedAt: "asc" },
    select: { user: { select: { id: true, name: true } } },
  });
  return members.map((member) => member.user);
}

export type AssignableMember = Awaited<ReturnType<typeof listAssignableMembers>>[number];
