import "server-only";
import { type ActivityChange, diffTaskChanges, type TrackedTaskFields } from "@/domain/activity";
import { parseDateOnly, toDateOnlyString } from "@/domain/dates";
import type { TaskStatus } from "@/generated/prisma/client";
import { m } from "@/i18n";
import { authorizeProject } from "@/lib/auth/authorization";
import { db, type DbClient } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  type ColumnOrder,
  diffPositions,
  groupIntoColumns,
  moveTaskInColumns,
  type PositionedTask,
} from "@/domain/task-position";
import type { MoveTaskInput, TaskInput } from "./schemas";

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

/**
 * プロジェクト行を排他ロックする。
 * 同じプロジェクトのタスクの並び順を変更する処理を直列化し、position の重複・欠番を防ぐ。
 */
export async function lockProject(tx: DbClient, projectId: string) {
  await tx.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`;
}

/** 指定した列（ステータス）のタスクの現在の並び */
async function loadColumns(tx: DbClient, projectId: string, statuses: TaskStatus[]) {
  return tx.task.findMany({
    where: { projectId, status: { in: statuses } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, status: true, position: true },
  });
}

/** 並びの変化分だけ status / position を更新する */
async function applyPositions(tx: DbClient, current: PositionedTask[], columns: ColumnOrder) {
  for (const change of diffPositions(current, columns)) {
    await tx.task.update({
      where: { id: change.id },
      data: { status: change.status, position: change.position },
    });
  }
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

/** 履歴の比較に使う形（期限は "YYYY-MM-DD"） */
function trackedFields(task: {
  status: string;
  assigneeId: string | null;
  dueDate: Date | null;
  priority: string;
}): TrackedTaskFields {
  return {
    status: task.status,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate ? toDateOnlyString(task.dueDate) : null,
    priority: task.priority,
  };
}

/** 更新履歴を記録する（呼び出し元のトランザクション内で、タスクの更新と同時に確定する） */
export async function recordActivity(
  tx: DbClient,
  { projectId, taskId, userId, changes }: { projectId: string; taskId: string; userId: string; changes: ActivityChange[] },
) {
  if (changes.length === 0) return;
  await tx.activityLog.createMany({
    data: changes.map((change) => ({ projectId, taskId, userId, ...change })),
  });
}

export async function createTask(userId: string, projectId: string, input: TaskInput) {
  return db.$transaction(async (tx) => {
    await authorizeProject(tx, { projectId, userId, permission: "task:create" });
    // ロックしてから担当者を検証する（同時に行われるメンバー削除と直列化するため）
    await lockProject(tx, projectId);
    await assertAssigneeIsMember(tx, projectId, input.assigneeId);
    const position = await tx.task.count({ where: { projectId, status: input.status } });
    const task = await tx.task.create({ data: { ...toTaskData(input), projectId, position } });
    await tx.activityLog.create({ data: { projectId, taskId: task.id, userId, action: "TASK_CREATED" } });
    return task;
  });
}

export async function updateTask(userId: string, taskId: string, input: TaskInput) {
  return db.$transaction(async (tx) => {
    const { projectId } = await findTaskOrThrow(tx, taskId);
    await authorizeProject(tx, { projectId, userId, permission: "task:update" });
    await lockProject(tx, projectId);
    await assertAssigneeIsMember(tx, projectId, input.assigneeId);

    // ロック取得後の最新の状態で判定する
    const before = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true, assigneeId: true, dueDate: true, priority: true },
    });
    if (before.status !== input.status) {
      // ステータスが変わった場合は移動先の列の末尾に置き、移動元の列を詰める
      const current = await loadColumns(tx, projectId, [before.status, input.status]);
      await applyPositions(
        tx,
        current,
        moveTaskInColumns(groupIntoColumns(current), taskId, input.status, Infinity),
      );
    }

    const data = toTaskData(input);
    const task = await tx.task.update({ where: { id: taskId }, data });
    await recordActivity(tx, {
      projectId,
      taskId,
      userId,
      changes: diffTaskChanges(trackedFields(before), trackedFields(data)),
    });
    return task;
  });
}

/**
 * カンバンでの移動（列内の並べ替え・列間の移動）。
 * 移動元・移動先の列の position を 0 始まりの連番に振り直す。列が変わった場合はステータス変更として履歴に残す。
 */
export async function moveTask(userId: string, taskId: string, input: MoveTaskInput) {
  return db.$transaction(async (tx) => {
    const { projectId } = await findTaskOrThrow(tx, taskId);
    await authorizeProject(tx, { projectId, userId, permission: "task:update" });
    await lockProject(tx, projectId);

    const { status } = await findTaskOrThrow(tx, taskId);
    const current = await loadColumns(tx, projectId, [...new Set([status, input.status])]);
    await applyPositions(
      tx,
      current,
      moveTaskInColumns(groupIntoColumns(current), taskId, input.status, input.index),
    );
    if (status !== input.status) {
      await recordActivity(tx, {
        projectId,
        taskId,
        userId,
        changes: [{ action: "STATUS_CHANGED", oldValue: status, newValue: input.status }],
      });
    }
    return { projectId };
  });
}

export async function deleteTask(userId: string, taskId: string) {
  return db.$transaction(async (tx) => {
    const { projectId } = await findTaskOrThrow(tx, taskId);
    await authorizeProject(tx, { projectId, userId, permission: "task:delete" });
    await lockProject(tx, projectId);

    const { status } = await findTaskOrThrow(tx, taskId);
    // コメント・履歴は外部キーの CASCADE で削除される
    await tx.task.delete({ where: { id: taskId } });
    // 削除した列を詰め直す
    const current = await loadColumns(tx, projectId, [status]);
    await applyPositions(tx, current, groupIntoColumns(current));
    return { projectId };
  });
}
