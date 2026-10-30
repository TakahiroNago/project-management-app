import { describe, expect, it } from "vitest";
import { createProject } from "@/features/projects/service";
import { listAssignableMembers, listTasksForProject } from "@/features/tasks/queries";
import { createTask, deleteTask, updateTask } from "@/features/tasks/service";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { addMember, createUser, projectInput, taskInput } from "../helpers/factories";

async function setup() {
  const owner = await createUser("owner");
  const member = await createUser("member");
  const outsider = await createUser("outsider");
  const project = await createProject(owner.id, projectInput());
  await addMember(project.id, member.id);
  return { owner, member, outsider, project };
}

describe("タスクの作成・更新・削除", () => {
  it("Owner・Member ともにタスクを作成・更新・削除できる", async () => {
    const { owner, member, project } = await setup();

    const task = await createTask(member.id, project.id, taskInput({ title: "設計", dueDate: "2026-11-15" }));
    expect(task).toMatchObject({ projectId: project.id, title: "設計", status: "TODO", priority: "MEDIUM" });
    expect(task.dueDate?.toISOString()).toBe("2026-11-15T00:00:00.000Z");

    await updateTask(owner.id, task.id, taskInput({ title: "詳細設計", priority: "URGENT", assigneeId: member.id }));
    expect(await db.task.findUnique({ where: { id: task.id } })).toMatchObject({
      title: "詳細設計",
      priority: "URGENT",
      assigneeId: member.id,
    });

    await deleteTask(member.id, task.id);
    expect(await db.task.count()).toBe(0);
  });

  it("新しいタスクは列の末尾に追加され、ステータス変更時は移動先の列の末尾に置かれる", async () => {
    const { owner, project } = await setup();
    const a = await createTask(owner.id, project.id, taskInput({ title: "A" }));
    const b = await createTask(owner.id, project.id, taskInput({ title: "B" }));
    const done = await createTask(owner.id, project.id, taskInput({ title: "D", status: "DONE" }));
    expect([a.position, b.position, done.position]).toEqual([0, 1, 0]);

    const moved = await updateTask(owner.id, a.id, taskInput({ title: "A", status: "DONE" }));
    expect(moved.position).toBe(1);

    const unchanged = await updateTask(owner.id, b.id, taskInput({ title: "B2" }));
    expect(unchanged.position).toBe(1);
  });

  it("担当者にプロジェクト外のユーザーは指定できない", async () => {
    const { owner, outsider, project } = await setup();
    await expect(
      createTask(owner.id, project.id, taskInput({ assigneeId: outsider.id })),
    ).rejects.toThrow(ValidationError);

    const task = await createTask(owner.id, project.id, taskInput());
    await expect(
      updateTask(owner.id, task.id, taskInput({ assigneeId: outsider.id })),
    ).rejects.toThrow(ValidationError);
    expect(await db.task.findUnique({ where: { id: task.id } })).toMatchObject({ assigneeId: null });
  });
});

describe("タスクの認可（ユーザー間のデータ分離）", () => {
  it("プロジェクト外のユーザーはタスクを作成・更新・削除・閲覧できない", async () => {
    const { owner, outsider, project } = await setup();
    const task = await createTask(owner.id, project.id, taskInput({ title: "秘密" }));

    await expect(createTask(outsider.id, project.id, taskInput())).rejects.toThrow(NotFoundError);
    await expect(updateTask(outsider.id, task.id, taskInput({ title: "改ざん" }))).rejects.toThrow(
      NotFoundError,
    );
    await expect(deleteTask(outsider.id, task.id)).rejects.toThrow(NotFoundError);
    await expect(listTasksForProject(outsider.id, project.id)).rejects.toThrow(NotFoundError);
    await expect(listAssignableMembers(outsider.id, project.id)).rejects.toThrow(NotFoundError);

    expect(await db.task.findMany()).toEqual([expect.objectContaining({ id: task.id, title: "秘密" })]);
  });

  it("自分のプロジェクトのタスク ID を指定しても、他プロジェクトのタスクは操作できない", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    await createProject(alice.id, projectInput());
    const bobProject = await createProject(bob.id, projectInput());
    const bobTask = await createTask(bob.id, bobProject.id, taskInput());

    await expect(updateTask(alice.id, bobTask.id, taskInput({ title: "x" }))).rejects.toThrow(NotFoundError);
    await expect(deleteTask(alice.id, bobTask.id)).rejects.toThrow(NotFoundError);
  });

  it("一覧はステータス・並び順で返り、担当者の候補はメンバーのみ", async () => {
    const { owner, member, project } = await setup();
    await createTask(owner.id, project.id, taskInput({ title: "done", status: "DONE" }));
    await createTask(owner.id, project.id, taskInput({ title: "todo1" }));
    await createTask(owner.id, project.id, taskInput({ title: "todo2", assigneeId: member.id }));

    const tasks = await listTasksForProject(member.id, project.id);
    expect(tasks.map((t) => t.title)).toEqual(["todo1", "todo2", "done"]);
    expect(tasks[1].assignee).toEqual({ id: member.id, name: "member" });

    const members = await listAssignableMembers(member.id, project.id);
    expect(members.map((m) => m.id)).toEqual([owner.id, member.id]);
  });

  it("存在しないタスクは NotFound", async () => {
    const { owner } = await setup();
    await expect(deleteTask(owner.id, "does-not-exist")).rejects.toThrow(NotFoundError);
  });
});
