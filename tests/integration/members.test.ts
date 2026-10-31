import { describe, expect, it } from "vitest";
import { addMember, removeMember } from "@/features/members/service";
import { listMembers } from "@/features/members/queries";
import { createProject } from "@/features/projects/service";
import { createTask, updateTask } from "@/features/tasks/service";
import { m } from "@/i18n";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { createUser, projectInput, taskInput } from "../helpers/factories";
import { resetDatabase } from "../helpers/db";
import { countTransactionQueries } from "../helpers/query-count";

async function setup() {
  const owner = await createUser("owner");
  const alice = await createUser("alice");
  const bob = await createUser("bob");
  const outsider = await createUser("outsider");
  const project = await createProject(owner.id, projectInput());
  return { owner, alice, bob, outsider, project };
}

describe("メンバー追加", () => {
  it("Owner は登録済みユーザーをメールアドレスで MEMBER として追加できる", async () => {
    const { owner, alice, project } = await setup();
    await expect(addMember(owner.id, project.id, alice.email)).resolves.toMatchObject({ name: "alice" });

    const members = await listMembers(owner.id, project.id);
    expect(members.map((member) => [member.user.name, member.role])).toEqual([
      ["owner", "OWNER"],
      ["alice", "MEMBER"],
    ]);
  });

  it("未登録のメールアドレス・既存メンバーは項目エラー", async () => {
    const { owner, alice, project } = await setup();
    await expect(addMember(owner.id, project.id, "nobody@example.com")).rejects.toMatchObject({
      fieldErrors: { email: [m.member.userNotFound] },
    });
    await addMember(owner.id, project.id, alice.email);
    await expect(addMember(owner.id, project.id, alice.email)).rejects.toMatchObject({
      fieldErrors: { email: [m.member.alreadyMember] },
    });
    await expect(addMember(owner.id, project.id, owner.email)).rejects.toThrow(ValidationError);
  });

  it("同じユーザーを同時に追加しても重複しない", async () => {
    const { owner, alice, project } = await setup();
    const results = await Promise.allSettled([
      addMember(owner.id, project.id, alice.email),
      addMember(owner.id, project.id, alice.email),
      addMember(owner.id, project.id, alice.email),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);
    }
    expect(await db.projectMember.count({ where: { projectId: project.id, userId: alice.id } })).toBe(1);
  });

  it("Member は追加できず（Forbidden）、メンバー外は NotFound", async () => {
    const { owner, alice, bob, outsider, project } = await setup();
    await addMember(owner.id, project.id, alice.email);
    await expect(addMember(alice.id, project.id, bob.email)).rejects.toThrow(ForbiddenError);
    await expect(addMember(outsider.id, project.id, outsider.email)).rejects.toThrow(NotFoundError);
    await expect(listMembers(outsider.id, project.id)).rejects.toThrow(NotFoundError);
    expect(await db.projectMember.count({ where: { projectId: project.id } })).toBe(2);
  });

  it("追加されたメンバーはプロジェクトを閲覧し、タスクを操作でき、担当者にも設定できる", async () => {
    const { owner, alice, project } = await setup();
    await addMember(owner.id, project.id, alice.email);
    const task = await createTask(alice.id, project.id, taskInput({ assigneeId: alice.id }));
    expect(task.assigneeId).toBe(alice.id);
  });
});

describe("メンバー削除", () => {
  it("削除するとプロジェクトにアクセスできなくなり、担当タスクは未割り当てに戻る（履歴も残る）", async () => {
    const { owner, alice, bob, project } = await setup();
    await addMember(owner.id, project.id, alice.email);
    await addMember(owner.id, project.id, bob.email);
    const aliceTask1 = await createTask(owner.id, project.id, taskInput({ assigneeId: alice.id }));
    const aliceTask2 = await createTask(owner.id, project.id, taskInput({ assigneeId: alice.id, status: "DONE" }));
    const bobTask = await createTask(owner.id, project.id, taskInput({ assigneeId: bob.id }));

    await expect(removeMember(owner.id, project.id, alice.id)).resolves.toEqual({
      name: "alice",
      unassignedTaskCount: 2,
    });

    expect(await db.projectMember.findMany({ where: { projectId: project.id }, select: { userId: true } })).toEqual(
      expect.not.arrayContaining([{ userId: alice.id }]),
    );
    for (const id of [aliceTask1.id, aliceTask2.id]) {
      expect(await db.task.findUniqueOrThrow({ where: { id } })).toMatchObject({ assigneeId: null });
      expect(
        await db.activityLog.findFirst({ where: { taskId: id, action: "ASSIGNEE_CHANGED" } }),
      ).toMatchObject({ oldValue: alice.id, newValue: null, userId: owner.id });
    }
    expect(await db.task.findUniqueOrThrow({ where: { id: bobTask.id } })).toMatchObject({ assigneeId: bob.id });

    // 削除されたメンバーはタスクを操作できない
    await expect(createTask(alice.id, project.id, taskInput())).rejects.toThrow(NotFoundError);
    // 削除されたメンバーを担当者に設定することもできない
    await expect(updateTask(owner.id, bobTask.id, taskInput({ assigneeId: alice.id }))).rejects.toThrow(
      ValidationError,
    );
  });

  it("Owner は削除できない（自分自身も含む）", async () => {
    const { owner, project } = await setup();
    await expect(removeMember(owner.id, project.id, owner.id)).rejects.toMatchObject({
      message: m.member.cannotRemoveOwner,
    });
    expect(await db.projectMember.count({ where: { projectId: project.id, role: "OWNER" } })).toBe(1);
  });

  it("Member は他のメンバーを削除できず、メンバー外は NotFound", async () => {
    const { owner, alice, bob, outsider, project } = await setup();
    await addMember(owner.id, project.id, alice.email);
    await addMember(owner.id, project.id, bob.email);
    await expect(removeMember(alice.id, project.id, bob.id)).rejects.toThrow(ForbiddenError);
    await expect(removeMember(outsider.id, project.id, bob.id)).rejects.toThrow(NotFoundError);
    await expect(removeMember(owner.id, project.id, outsider.id)).rejects.toThrow(NotFoundError);
    expect(await db.projectMember.count({ where: { projectId: project.id } })).toBe(3);
  });

  it("担当者の設定とメンバー削除が同時に行われても、削除済みメンバーが担当者として残らない", async () => {
    const { owner, alice, project } = await setup();
    await addMember(owner.id, project.id, alice.email);
    const tasks = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTask(owner.id, project.id, taskInput({ title: `T${i}` }))),
    );

    await Promise.allSettled([
      removeMember(owner.id, project.id, alice.id),
      ...tasks.map((task) => updateTask(owner.id, task.id, taskInput({ title: task.title, assigneeId: alice.id }))),
    ]);

    expect(await db.task.count({ where: { projectId: project.id, assigneeId: alice.id } })).toBe(0);
    expect(await db.projectMember.count({ where: { projectId: project.id, userId: alice.id } })).toBe(0);
  });

  it("担当タスクが多くても、未割り当てへの変更と履歴の記録は件数によらず一定のクエリ数で行う", async () => {
    const queriesFor = async (count: number) => {
      const { owner, alice, project } = await setup();
      await addMember(owner.id, project.id, alice.email);
      await db.task.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          projectId: project.id,
          title: `T${i}`,
          assigneeId: alice.id,
          position: i,
        })),
      });
      let result: Awaited<ReturnType<typeof removeMember>> | undefined;
      const queries = await countTransactionQueries(async () => {
        result = await removeMember(owner.id, project.id, alice.id);
      });
      expect(result).toEqual({ name: "alice", unassignedTaskCount: count });
      expect(await db.task.count({ where: { projectId: project.id, assigneeId: null } })).toBe(count);
      expect(
        await db.activityLog.count({
          where: { projectId: project.id, action: "ASSIGNEE_CHANGED", oldValue: alice.id, newValue: null, userId: owner.id },
        }),
      ).toBe(count);
      return queries;
    };

    const few = await queriesFor(2);
    await resetDatabase();
    expect(await queriesFor(40)).toBe(few);
  });
});
