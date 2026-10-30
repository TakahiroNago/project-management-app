import "server-only";
import { parseDateOnly } from "@/domain/dates";
import type { TaskStatus } from "@/generated/prisma/client";
import { m } from "@/i18n";
import { authorizeProject } from "@/lib/auth/authorization";
import { db, type DbClient } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { TaskInput } from "./schemas";

function toTaskData(input: TaskInput) {
  return {
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId,
    startDate: input.startDate ? parseDateOnly(input.startDate) : null,
    dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
  };
}

/** 担当者はプロジェクトのメンバーでなければならない */
async function assertAssigneeIsMember(tx: DbClient, projectId: string, assigneeId: string | null) {
  if (!assigneeId) return;
  const member = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: assigneeId } },
    select: { id: true },
  });
  if (!member) {
    throw new ValidationError(m.errors.invalidAssignee, { assigneeId: [m.errors.invalidAssignee] });
  }
}

/** 指定した列の末尾の position */
async function nextPosition(tx: DbClient, projectId: string, status: TaskStatus) {
  const { _max } = await tx.task.aggregate({
    where: { projectId, status },
    _max: { position: true },
  });
  return (_max.position ?? -1) + 1;
}

/** タスクの所属プロジェクトをサーバー側で解決する（クライアントから渡された projectId は信用しない） */
async function findTaskOrThrow(tx: DbClient, taskId: string) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, status: true },
  });
  if (!task) throw new NotFoundError();
  return task;
}

export async function createTask(userId: string, projectId: string, input: TaskInput) {
  return db.$transaction(async (tx) => {
    await authorizeProject(tx, { projectId, userId, permission: "task:create" });
    await assertAssigneeIsMember(tx, projectId, input.assigneeId);
    return tx.task.create({
      data: {
        ...toTaskData(input),
        projectId,
        position: await nextPosition(tx, projectId, input.status),
      },
    });
  });
}

export async function updateTask(userId: string, taskId: string, input: TaskInput) {
  return db.$transaction(async (tx) => {
    const task = await findTaskOrThrow(tx, taskId);
    await authorizeProject(tx, { projectId: task.projectId, userId, permission: "task:update" });
    await assertAssigneeIsMember(tx, task.projectId, input.assigneeId);

    // ステータスが変わった場合は移動先の列の末尾に置く（列内の並べ替えは Phase 2 のカンバンで実装）
    const position =
      task.status === input.status ? undefined : await nextPosition(tx, task.projectId, input.status);

    return tx.task.update({
      where: { id: taskId },
      data: { ...toTaskData(input), ...(position === undefined ? {} : { position }) },
    });
  });
}

export async function deleteTask(userId: string, taskId: string) {
  return db.$transaction(async (tx) => {
    const task = await findTaskOrThrow(tx, taskId);
    await authorizeProject(tx, { projectId: task.projectId, userId, permission: "task:delete" });
    await tx.task.delete({ where: { id: taskId } });
    return { projectId: task.projectId };
  });
}
