import "server-only";
import { parseDateOnly } from "@/domain/dates";
import { authorizeProject } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import type { ProjectInput } from "./schemas";

function toProjectData(input: ProjectInput) {
  return {
    name: input.name,
    description: input.description,
    status: input.status,
    startDate: input.startDate ? parseDateOnly(input.startDate) : null,
    dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
  };
}

/**
 * プロジェクトを作成し、作成者を OWNER として登録する。
 * 両者は同一トランザクションで作成する（DB 側でも「Owner がちょうど 1 人」をトリガーで保証している）。
 */
export async function createProject(userId: string, input: ProjectInput) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.create({ data: toProjectData(input) });
    await tx.projectMember.create({
      data: { projectId: project.id, userId, role: "OWNER" },
    });
    return project;
  });
}

/** プロジェクトを更新する（Owner のみ）。権限検証と更新は同一トランザクション */
export async function updateProject(userId: string, projectId: string, input: ProjectInput) {
  return db.$transaction(async (tx) => {
    await authorizeProject(tx, { projectId, userId, permission: "project:update" });
    return tx.project.update({ where: { id: projectId }, data: toProjectData(input) });
  });
}

/** プロジェクトを削除する（Owner のみ）。タスク・メンバー等は外部キーの CASCADE で削除される */
export async function deleteProject(userId: string, projectId: string) {
  await db.$transaction(async (tx) => {
    await authorizeProject(tx, { projectId, userId, permission: "project:delete" });
    await tx.project.delete({ where: { id: projectId } });
  });
}
