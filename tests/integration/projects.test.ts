import { describe, expect, it } from "vitest";
import { getProjectForUser, listProjectsForUser } from "@/features/projects/queries";
import { projectListQuerySchema } from "@/features/projects/schemas";
import { createProject, deleteProject, updateProject } from "@/features/projects/service";
import { createTask } from "@/features/tasks/service";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { addMember, createUser, projectInput, taskInput } from "../helpers/factories";

const query = (params: Record<string, string> = {}) => projectListQuerySchema.parse(params);

describe("プロジェクト作成", () => {
  it("作成者が OWNER として登録される", async () => {
    const owner = await createUser();
    const project = await createProject(
      owner.id,
      projectInput({ name: "新規", startDate: "2026-11-01", dueDate: "2026-12-31" }),
    );

    const members = await db.projectMember.findMany({ where: { projectId: project.id } });
    expect(members).toEqual([expect.objectContaining({ userId: owner.id, role: "OWNER" })]);
    expect(project.startDate?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(project.dueDate?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("Owner 登録に失敗した場合はプロジェクトも作成されない（トランザクション）", async () => {
    await expect(
      createProject("non-existent-user-id", projectInput({ name: "ロールバック" })),
    ).rejects.toThrow();
    expect(await db.project.count()).toBe(0);
  });
});

describe("Owner の整合性（DB トリガー）", () => {
  it("OWNER のいないプロジェクトはコミットできない", async () => {
    await expect(db.project.create({ data: { name: "owner なし" } })).rejects.toThrow(/OWNER/);
    expect(await db.project.count()).toBe(0);
  });

  it("OWNER を 2 人にはできない", async () => {
    const owner = await createUser();
    const other = await createUser();
    const project = await createProject(owner.id, projectInput());
    await expect(
      db.projectMember.create({ data: { projectId: project.id, userId: other.id, role: "OWNER" } }),
    ).rejects.toThrow(/OWNER/);
  });

  it("唯一の OWNER を削除・降格できない", async () => {
    const owner = await createUser();
    const project = await createProject(owner.id, projectInput());
    const where = { projectId_userId: { projectId: project.id, userId: owner.id } };

    await expect(db.projectMember.delete({ where })).rejects.toThrow(/OWNER/);
    await expect(db.projectMember.update({ where, data: { role: "MEMBER" } })).rejects.toThrow(/OWNER/);
    expect(await db.projectMember.findUnique({ where })).toMatchObject({ role: "OWNER" });
  });

  it("プロジェクト削除時はメンバーも CASCADE で削除できる", async () => {
    const owner = await createUser();
    const project = await createProject(owner.id, projectInput());
    await deleteProject(owner.id, project.id);
    expect(await db.projectMember.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe("プロジェクト更新・削除の認可", () => {
  async function setup() {
    const owner = await createUser("owner");
    const member = await createUser("member");
    const outsider = await createUser("outsider");
    const project = await createProject(owner.id, projectInput({ name: "元の名前" }));
    await addMember(project.id, member.id);
    return { owner, member, outsider, project };
  }

  it("Owner は更新できる", async () => {
    const { owner, project } = await setup();
    await updateProject(owner.id, project.id, projectInput({ name: "新しい名前", status: "IN_PROGRESS" }));
    expect(await db.project.findUnique({ where: { id: project.id } })).toMatchObject({
      name: "新しい名前",
      status: "IN_PROGRESS",
    });
  });

  it("Member は更新・削除できない（Forbidden）", async () => {
    const { member, project } = await setup();
    await expect(updateProject(member.id, project.id, projectInput({ name: "x" }))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(deleteProject(member.id, project.id)).rejects.toThrow(ForbiddenError);
    expect(await db.project.findUnique({ where: { id: project.id } })).toMatchObject({ name: "元の名前" });
  });

  it("メンバー以外は更新・削除できず、存在も分からない（NotFound）", async () => {
    const { outsider, project } = await setup();
    await expect(updateProject(outsider.id, project.id, projectInput({ name: "x" }))).rejects.toThrow(
      NotFoundError,
    );
    await expect(deleteProject(outsider.id, project.id)).rejects.toThrow(NotFoundError);
    expect(await db.project.count()).toBe(1);
  });

  it("存在しないプロジェクトも NotFound（メンバー外と区別できない）", async () => {
    const { owner } = await setup();
    await expect(deleteProject(owner.id, "does-not-exist")).rejects.toThrow(NotFoundError);
  });

  it("Owner が削除すると、タスクも含めて削除される", async () => {
    const { owner, project } = await setup();
    await createTask(owner.id, project.id, taskInput());
    await deleteProject(owner.id, project.id);
    expect(await db.project.count()).toBe(0);
    expect(await db.task.count()).toBe(0);
  });
});

describe("プロジェクト一覧・詳細の取得", () => {
  it("自分が所属するプロジェクトのみ取得できる（ユーザー間のデータ分離）", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const aliceProject = await createProject(alice.id, projectInput({ name: "Alice のプロジェクト" }));
    const bobProject = await createProject(bob.id, projectInput({ name: "Bob のプロジェクト" }));
    await addMember(bobProject.id, alice.id);

    const aliceList = await listProjectsForUser(alice.id, query());
    expect(aliceList.items.map((p) => p.name).sort()).toEqual(
      ["Alice のプロジェクト", "Bob のプロジェクト"].sort(),
    );
    expect(aliceList.items.find((p) => p.id === bobProject.id)?.role).toBe("MEMBER");

    const bobList = await listProjectsForUser(bob.id, query());
    expect(bobList.items.map((p) => p.id)).toEqual([bobProject.id]);

    expect(await getProjectForUser(bob.id, aliceProject.id)).toBeNull();
    expect(await getProjectForUser(alice.id, bobProject.id)).toMatchObject({ role: "MEMBER" });
  });

  it("名前の部分一致（大文字小文字を区別しない）とステータスで絞り込める", async () => {
    const user = await createUser();
    await createProject(user.id, projectInput({ name: "Website Renewal", status: "IN_PROGRESS" }));
    await createProject(user.id, projectInput({ name: "Mobile App", status: "IN_PROGRESS" }));
    await createProject(user.id, projectInput({ name: "website docs", status: "COMPLETED" }));

    const byName = await listProjectsForUser(user.id, query({ q: "WEBSITE" }));
    expect(byName.items.map((p) => p.name).sort()).toEqual(["Website Renewal", "website docs"]);

    const byStatus = await listProjectsForUser(user.id, query({ q: "website", status: "COMPLETED" }));
    expect(byStatus.items.map((p) => p.name)).toEqual(["website docs"]);
  });

  it("期限順では期限が近い順に並び、期限なしは最後になる", async () => {
    const user = await createUser();
    await createProject(user.id, projectInput({ name: "期限なし" }));
    await createProject(user.id, projectInput({ name: "12月", dueDate: "2026-12-01" }));
    await createProject(user.id, projectInput({ name: "11月", dueDate: "2026-11-01" }));

    const list = await listProjectsForUser(user.id, query({ sort: "dueDate" }));
    expect(list.items.map((p) => p.name)).toEqual(["11月", "12月", "期限なし"]);
  });

  it("20 件ごとにページ分割される", async () => {
    const user = await createUser();
    for (let i = 0; i < 21; i++) {
      await createProject(user.id, projectInput({ name: `P${String(i).padStart(2, "0")}` }));
    }
    const page1 = await listProjectsForUser(user.id, query({ sort: "name" }));
    const page2 = await listProjectsForUser(user.id, query({ sort: "name", page: "2" }));
    expect(page1).toMatchObject({ total: 21, pageCount: 2 });
    expect(page1.items).toHaveLength(20);
    expect(page2.items.map((p) => p.name)).toEqual(["P20"]);
  });

  it("進捗率は完了タスク数 ÷ 全タスク数", async () => {
    const user = await createUser();
    const project = await createProject(user.id, projectInput());
    await createTask(user.id, project.id, taskInput({ status: "DONE" }));
    await createTask(user.id, project.id, taskInput({ status: "TODO" }));
    await createTask(user.id, project.id, taskInput({ status: "IN_PROGRESS" }));

    const [item] = (await listProjectsForUser(user.id, query())).items;
    expect(item).toMatchObject({ taskCount: 3, doneCount: 1, progress: 33 });
    expect(await getProjectForUser(user.id, project.id)).toMatchObject({ progress: 33 });
  });
});
