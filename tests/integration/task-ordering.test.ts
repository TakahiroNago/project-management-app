import { describe, expect, it } from "vitest";
import { createProject } from "@/features/projects/service";
import { createTask, deleteTask, moveTask, updateTask } from "@/features/tasks/service";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { addMember, createUser, projectInput, taskInput } from "../helpers/factories";
import { countTransactionQueries } from "../helpers/query-count";

type Status = "TODO" | "IN_PROGRESS" | "DONE";

/** 列ごとのタスク名の並び（position 順） */
async function board(projectId: string) {
  const tasks = await db.task.findMany({
    where: { projectId },
    orderBy: [{ position: "asc" }],
    select: { title: true, status: true, position: true },
  });
  const columns: Record<Status, string[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
  for (const task of tasks) columns[task.status].push(task.title);
  return columns;
}

/** すべての列で position が 0 始まりの連番になっていること */
async function expectContiguousPositions(projectId: string) {
  const tasks = await db.task.findMany({ where: { projectId }, select: { status: true, position: true } });
  for (const status of ["TODO", "IN_PROGRESS", "DONE"] as const) {
    const positions = tasks
      .filter((t) => t.status === status)
      .map((t) => t.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual(positions.map((_, i) => i));
  }
}

async function setup() {
  const owner = await createUser("owner");
  const project = await createProject(owner.id, projectInput());
  const ids: Record<string, string> = {};
  for (const title of ["A", "B", "C"]) {
    ids[title] = (await createTask(owner.id, project.id, taskInput({ title }))).id;
  }
  ids.X = (await createTask(owner.id, project.id, taskInput({ title: "X", status: "IN_PROGRESS" }))).id;
  return { owner, project, ids };
}

describe("moveTask（カンバンの移動）", () => {
  it("同じ列の中で並べ替えられる", async () => {
    const { owner, project, ids } = await setup();
    await moveTask(owner.id, ids.C, { status: "TODO", index: 0 });
    expect((await board(project.id)).TODO).toEqual(["C", "A", "B"]);
    await expectContiguousPositions(project.id);
  });

  it("別の列の指定位置へ移動するとステータスも変わり、両方の列が連番に詰められる", async () => {
    const { owner, project, ids } = await setup();
    await moveTask(owner.id, ids.A, { status: "IN_PROGRESS", index: 1 });
    expect(await board(project.id)).toEqual({ TODO: ["B", "C"], IN_PROGRESS: ["X", "A"], DONE: [] });
    expect(await db.task.findUnique({ where: { id: ids.A } })).toMatchObject({ status: "IN_PROGRESS" });
    await expectContiguousPositions(project.id);
  });

  it("空の列への移動・範囲外の位置は末尾に丸める", async () => {
    const { owner, project, ids } = await setup();
    await moveTask(owner.id, ids.B, { status: "DONE", index: 50 });
    expect((await board(project.id)).DONE).toEqual(["B"]);
    await expectContiguousPositions(project.id);
  });

  it("Member も移動できるが、メンバー外は NotFound で何も変わらない", async () => {
    const { owner, project, ids } = await setup();
    const member = await createUser("member");
    const outsider = await createUser("outsider");
    await addMember(project.id, member.id);

    await moveTask(member.id, ids.A, { status: "DONE", index: 0 });
    await expect(moveTask(outsider.id, ids.B, { status: "DONE", index: 0 })).rejects.toThrow(NotFoundError);
    expect((await board(project.id)).DONE).toEqual(["A"]);
    expect(owner.id).toBeTruthy();
  });

  it("存在しないタスクは NotFound", async () => {
    const { owner } = await setup();
    await expect(moveTask(owner.id, "missing", { status: "DONE", index: 0 })).rejects.toThrow(NotFoundError);
  });

  it("同時に移動しても position が重複・欠番しない（プロジェクト単位のロック）", async () => {
    const { owner, project, ids } = await setup();
    for (let i = 0; i < 5; i++) {
      await createTask(owner.id, project.id, taskInput({ title: `T${i}` }));
    }
    const all = await db.task.findMany({ where: { projectId: project.id }, select: { id: true } });
    const targets: Status[] = ["TODO", "IN_PROGRESS", "DONE"];

    await Promise.all(
      all.map((task, i) =>
        moveTask(owner.id, task.id, { status: targets[i % 3], index: (i * 7) % 4 }),
      ),
    );
    await Promise.all([
      createTask(owner.id, project.id, taskInput({ title: "並行作成1" })),
      createTask(owner.id, project.id, taskInput({ title: "並行作成2" })),
      moveTask(owner.id, ids.A, { status: "TODO", index: 0 }),
      deleteTask(owner.id, ids.X),
    ]);

    await expectContiguousPositions(project.id);
    expect(await db.task.count({ where: { projectId: project.id } })).toBe(all.length + 2 - 1);
  });
});

describe("並び順の整合性（作成・更新・削除）", () => {
  it("削除すると同じ列の後続タスクが詰められる", async () => {
    const { owner, project, ids } = await setup();
    await deleteTask(owner.id, ids.A);
    expect((await board(project.id)).TODO).toEqual(["B", "C"]);
    await expectContiguousPositions(project.id);
  });

  it("編集でステータスを変えると移動先の末尾に置かれ、移動元が詰められる", async () => {
    const { owner, project, ids } = await setup();
    await updateTask(owner.id, ids.A, taskInput({ title: "A", status: "IN_PROGRESS" }));
    expect(await board(project.id)).toEqual({ TODO: ["B", "C"], IN_PROGRESS: ["X", "A"], DONE: [] });
    await expectContiguousPositions(project.id);
  });

  it("ステータスを変えない編集では並び順は変わらない", async () => {
    const { owner, project, ids } = await setup();
    await moveTask(owner.id, ids.C, { status: "TODO", index: 0 });
    await updateTask(owner.id, ids.A, taskInput({ title: "A2", priority: "HIGH" }));
    expect((await board(project.id)).TODO).toEqual(["C", "A2", "B"]);
  });
});

describe("Server Action 経由の移動", () => {
  it("権限エラーは Forbidden ではなく NotFound（他プロジェクトのタスク ID でも存在を隠す）", async () => {
    const { ids } = await setup();
    const stranger = await createUser("stranger");
    await createProject(stranger.id, projectInput());
    const error = await moveTask(stranger.id, ids.A, { status: "DONE", index: 0 }).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).not.toBeInstanceOf(ForbiddenError);
  });
});

describe("タスクが多い列での並べ替え（DB との往復の回数）", () => {
  /** 指定した列に count 件のタスクを position 順に直接作成する（"T00", "T01", …） */
  async function seedColumn(projectId: string, count: number, status: Status = "TODO") {
    await db.task.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        projectId,
        title: `T${String(i).padStart(2, "0")}`,
        status,
        position: i,
      })),
    });
    return db.task.findMany({ where: { projectId, status }, orderBy: { position: "asc" }, select: { id: true } });
  }

  async function projectWithColumn(count: number) {
    const owner = await createUser(`owner-${count}`);
    const project = await createProject(owner.id, projectInput());
    const tasks = await seedColumn(project.id, count);
    return { owner, project, tasks };
  }

  it("末尾のカードを先頭へ移すと全件の position が振り直され、updatedAt も更新される", async () => {
    const { owner, project, tasks } = await projectWithColumn(60);
    const before = await db.task.findUniqueOrThrow({ where: { id: tasks[0].id }, select: { updatedAt: true } });

    await moveTask(owner.id, tasks[59].id, { status: "TODO", index: 0 });

    const titles = (await board(project.id)).TODO;
    expect(titles[0]).toBe("T59");
    expect(titles.slice(1)).toEqual(Array.from({ length: 59 }, (_, i) => `T${String(i).padStart(2, "0")}`));
    await expectContiguousPositions(project.id);
    const after = await db.task.findUniqueOrThrow({ where: { id: tasks[0].id }, select: { updatedAt: true } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    // UTC で保存されていること（Prisma が書く値と同じ基準。数秒以内）
    expect(Math.abs(after.updatedAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("移動・編集・削除のクエリ数は列のタスク数によらず一定", async () => {
    const small = await projectWithColumn(5);
    const large = await projectWithColumn(60);

    const queries = async ({ owner, tasks }: Awaited<ReturnType<typeof projectWithColumn>>) => ({
      move: await countTransactionQueries(() => moveTask(owner.id, tasks.at(-1)!.id, { status: "TODO", index: 0 })),
      moveAcross: await countTransactionQueries(() => moveTask(owner.id, tasks[0].id, { status: "DONE", index: 0 })),
      update: await countTransactionQueries(() =>
        updateTask(owner.id, tasks[1].id, taskInput({ title: "変更", status: "IN_PROGRESS" })),
      ),
      remove: await countTransactionQueries(() => deleteTask(owner.id, tasks[2].id)),
    });

    expect(await queries(large)).toEqual(await queries(small));
    await expectContiguousPositions(large.project.id);
  });
});
