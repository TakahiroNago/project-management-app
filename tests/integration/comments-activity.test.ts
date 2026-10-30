import { describe, expect, it } from "vitest";
import { createComment, deleteComment, updateComment } from "@/features/comments/service";
import { addMember } from "@/features/members/service";
import { createProject } from "@/features/projects/service";
import { createTask, deleteTask, moveTask, updateTask } from "@/features/tasks/service";
import { getTaskThread } from "@/features/tasks/thread";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { createUser, projectInput, taskInput } from "../helpers/factories";

async function setup() {
  const owner = await createUser("owner");
  const member = await createUser("member");
  const outsider = await createUser("outsider");
  const project = await createProject(owner.id, projectInput());
  await addMember(owner.id, project.id, member.email);
  const task = await createTask(owner.id, project.id, taskInput({ title: "対象タスク" }));
  return { owner, member, outsider, project, task };
}

describe("コメント", () => {
  it("メンバーは投稿・閲覧でき、投稿順に並ぶ", async () => {
    const { owner, member, project, task } = await setup();
    await createComment(owner.id, task.id, "最初のコメント");
    await createComment(member.id, task.id, "返信です");

    const thread = await getTaskThread(member.id, project.id, task.id);
    expect(thread?.comments.map((c) => [c.user.name, c.content])).toEqual([
      ["owner", "最初のコメント"],
      ["member", "返信です"],
    ]);
  });

  it("自分のコメントだけ編集・削除できる（Owner でも他人のコメントは不可）", async () => {
    const { owner, member, task } = await setup();
    await createComment(member.id, task.id, "member のコメント");
    const comment = await db.comment.findFirstOrThrow();

    await expect(updateComment(owner.id, comment.id, "改ざん")).rejects.toThrow(ForbiddenError);
    await expect(deleteComment(owner.id, comment.id)).rejects.toThrow(ForbiddenError);

    expect(comment.updatedAt.getTime()).toBe(comment.createdAt.getTime());
    await updateComment(member.id, comment.id, "編集後");
    const edited = await db.comment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(edited.content).toBe("編集後");
    // 「編集済み」表示の判定に使う
    expect(edited.updatedAt.getTime()).toBeGreaterThan(edited.createdAt.getTime());

    await deleteComment(member.id, comment.id);
    expect(await db.comment.count()).toBe(0);
  });

  it("メンバー外は投稿・編集・削除・閲覧できない（NotFound）", async () => {
    const { owner, outsider, project, task } = await setup();
    await createComment(owner.id, task.id, "秘密");
    const comment = await db.comment.findFirstOrThrow();

    await expect(createComment(outsider.id, task.id, "x")).rejects.toThrow(NotFoundError);
    await expect(updateComment(outsider.id, comment.id, "x")).rejects.toThrow(NotFoundError);
    await expect(deleteComment(outsider.id, comment.id)).rejects.toThrow(NotFoundError);
    await expect(getTaskThread(outsider.id, project.id, task.id)).rejects.toThrow(NotFoundError);
    expect(await db.comment.findMany({ select: { content: true } })).toEqual([{ content: "秘密" }]);
  });

  it("別プロジェクトの URL にタスク ID を付けても取得できない", async () => {
    const { owner, task } = await setup();
    const otherProject = await createProject(owner.id, projectInput({ name: "別" }));
    expect(await getTaskThread(owner.id, otherProject.id, task.id)).toBeNull();
  });

  it("存在しないタスク・コメントは NotFound、タスク削除でコメントと履歴も消える", async () => {
    const { owner, task } = await setup();
    await expect(createComment(owner.id, "missing", "x")).rejects.toThrow(NotFoundError);
    await expect(updateComment(owner.id, "missing", "x")).rejects.toThrow(NotFoundError);

    await createComment(owner.id, task.id, "消える");
    await deleteTask(owner.id, task.id);
    expect(await db.comment.count()).toBe(0);
    expect(await db.activityLog.count({ where: { taskId: task.id } })).toBe(0);
  });
});

describe("更新履歴", () => {
  it("作成・ステータス・担当者・期限・優先度の変更が、誰がいつ何をしたかとともに記録される", async () => {
    const { owner, member, project, task } = await setup();

    await updateTask(
      member.id,
      task.id,
      taskInput({ title: "対象タスク", status: "IN_PROGRESS", assigneeId: member.id, dueDate: "2026-12-01", priority: "HIGH" }),
    );
    // タイトル・説明だけの変更は記録しない
    await updateTask(
      member.id,
      task.id,
      taskInput({ title: "名前だけ変更", description: "説明", status: "IN_PROGRESS", assigneeId: member.id, dueDate: "2026-12-01", priority: "HIGH" }),
    );
    // カンバンでの列移動はステータス変更として記録、列内の並べ替えは記録しない
    await moveTask(owner.id, task.id, { status: "DONE", index: 0 });
    await moveTask(owner.id, task.id, { status: "DONE", index: 0 });

    const thread = await getTaskThread(owner.id, project.id, task.id);
    const logs = [...thread!.activity].reverse().map((log) => [log.user?.name, log.action, log.oldValue, log.newValue]);
    expect(logs).toEqual([
      ["owner", "TASK_CREATED", null, null],
      ["member", "STATUS_CHANGED", "TODO", "IN_PROGRESS"],
      ["member", "ASSIGNEE_CHANGED", null, member.id],
      ["member", "DUE_DATE_CHANGED", null, "2026-12-01"],
      ["member", "PRIORITY_CHANGED", "MEDIUM", "HIGH"],
      ["owner", "STATUS_CHANGED", "IN_PROGRESS", "DONE"],
    ]);
    expect(thread!.userNames).toEqual({ [member.id]: "member" });
    expect(thread!.activity.every((log) => log.createdAt instanceof Date)).toBe(true);
  });

  it("タスクの更新に失敗した場合は履歴も残らない（同一トランザクション）", async () => {
    const { owner, outsider, task } = await setup();
    await expect(
      updateTask(owner.id, task.id, taskInput({ status: "DONE", assigneeId: outsider.id })),
    ).rejects.toThrow();
    expect(await db.activityLog.count({ where: { taskId: task.id, action: { not: "TASK_CREATED" } } })).toBe(0);
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "TODO" });
  });
});
