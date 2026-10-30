import { describe, expect, it } from "vitest";
import { getDashboard } from "@/features/dashboard/queries";
import { createProject } from "@/features/projects/service";
import { createTask } from "@/features/tasks/service";
import { addMember, createUser, projectInput, taskInput } from "../helpers/factories";

const TODAY = "2026-10-30";

describe("ダッシュボード", () => {
  it("集計値（プロジェクト数・未完了・期限切れ）は所属プロジェクトのみが対象", async () => {
    const me = await createUser("me");
    const other = await createUser("other");

    const active = await createProject(me.id, projectInput({ name: "進行中", status: "IN_PROGRESS" }));
    await createProject(me.id, projectInput({ name: "完了", status: "COMPLETED" }));
    await createProject(me.id, projectInput({ name: "計画中", status: "PLANNING" }));
    const shared = await createProject(other.id, projectInput({ name: "共有", status: "IN_PROGRESS" }));
    await addMember(shared.id, me.id);
    const foreign = await createProject(other.id, projectInput({ name: "他人", status: "IN_PROGRESS" }));

    await createTask(me.id, active.id, taskInput({ title: "期限切れ", dueDate: "2026-10-29" }));
    await createTask(me.id, active.id, taskInput({ title: "今日", dueDate: "2026-10-30" }));
    await createTask(me.id, active.id, taskInput({ title: "完了・期限切れ", status: "DONE", dueDate: "2026-10-01" }));
    await createTask(other.id, shared.id, taskInput({ title: "共有タスク", status: "IN_PROGRESS" }));
    await createTask(other.id, foreign.id, taskInput({ title: "他人の期限切れ", dueDate: "2026-01-01" }));

    const { stats } = await getDashboard(me.id, TODAY);
    expect(stats).toEqual({
      totalProjects: 4,
      inProgressProjects: 2,
      completedProjects: 1,
      openTasks: 3,
      overdueTasks: 1,
    });
  });

  it("直近のタスクは未完了・期限ありを期限が近い順に最大 10 件（他人のタスクは含まない）", async () => {
    const me = await createUser("me");
    const other = await createUser("other");
    const project = await createProject(me.id, projectInput({ name: "P" }));
    const foreign = await createProject(other.id, projectInput());

    await createTask(me.id, project.id, taskInput({ title: "期限なし" }));
    await createTask(me.id, project.id, taskInput({ title: "完了", status: "DONE", dueDate: "2026-10-01" }));
    await createTask(other.id, foreign.id, taskInput({ title: "他人", dueDate: "2026-10-01" }));
    for (let day = 12; day >= 1; day--) {
      const dueDate = `2026-11-${String(day).padStart(2, "0")}`;
      await createTask(me.id, project.id, taskInput({ title: `11/${day}`, dueDate }));
    }
    await createTask(me.id, project.id, taskInput({ title: "期限切れ", dueDate: "2026-10-20" }));

    const { recentTasks } = await getDashboard(me.id, TODAY);
    expect(recentTasks.map((t) => t.title)).toEqual([
      "期限切れ",
      ...Array.from({ length: 9 }, (_, i) => `11/${i + 1}`),
    ]);
    expect(recentTasks[0].project).toEqual({ id: project.id, name: "P" });
  });

  it("プロジェクトごとの進捗率を返す", async () => {
    const me = await createUser("me");
    const project = await createProject(me.id, projectInput({ name: "P" }));
    await createTask(me.id, project.id, taskInput({ status: "DONE" }));
    await createTask(me.id, project.id, taskInput({ status: "TODO" }));

    const { projects, hasMoreProjects } = await getDashboard(me.id, TODAY);
    expect(projects).toEqual([expect.objectContaining({ name: "P", progress: 50, taskCount: 2, doneCount: 1 })]);
    expect(hasMoreProjects).toBe(false);
  });

  it("データがない場合はすべて 0", async () => {
    const me = await createUser("me");
    const data = await getDashboard(me.id, TODAY);
    expect(data.stats).toEqual({
      totalProjects: 0,
      inProgressProjects: 0,
      completedProjects: 0,
      openTasks: 0,
      overdueTasks: 0,
    });
    expect(data.recentTasks).toEqual([]);
    expect(data.projects).toEqual([]);
  });
});
