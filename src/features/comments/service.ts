import "server-only";
import { authorizeProject } from "@/lib/auth/authorization";
import { db, type DbClient } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/** コメントを投稿する（プロジェクトのメンバーのみ） */
export async function createComment(userId: string, taskId: string, content: string) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundError();
    await authorizeProject(tx, { projectId: task.projectId, userId, permission: "comment:create" });
    // 作成日時と更新日時を同じ値にし、「編集済み」を updatedAt > createdAt で判定できるようにする
    const now = new Date();
    await tx.comment.create({ data: { taskId, userId, content, createdAt: now, updatedAt: now } });
    return { projectId: task.projectId };
  });
}

/**
 * 編集・削除の対象コメントを取得し、権限を検証する。
 * - プロジェクトのメンバーでない: NotFound（存在を隠す）
 * - メンバーだが投稿者本人でない: Forbidden（Owner でも他人のコメントは変更できない）
 */
async function authorizeOwnComment(tx: DbClient, userId: string, commentId: string) {
  const comment = await tx.comment.findUnique({
    where: { id: commentId },
    select: { userId: true, task: { select: { projectId: true } } },
  });
  if (!comment) throw new NotFoundError();
  await authorizeProject(tx, { projectId: comment.task.projectId, userId, permission: "comment:view" });
  if (comment.userId !== userId) throw new ForbiddenError();
  return { projectId: comment.task.projectId };
}

export async function updateComment(userId: string, commentId: string, content: string) {
  return db.$transaction(async (tx) => {
    const { projectId } = await authorizeOwnComment(tx, userId, commentId);
    await tx.comment.update({ where: { id: commentId }, data: { content } });
    return { projectId };
  });
}

export async function deleteComment(userId: string, commentId: string) {
  return db.$transaction(async (tx) => {
    const { projectId } = await authorizeOwnComment(tx, userId, commentId);
    await tx.comment.delete({ where: { id: commentId } });
    return { projectId };
  });
}
