import "server-only";
import { parseDateOnly } from "@/domain/dates";
import type { Prisma } from "@/generated/prisma/client";
import { listProjectsForUser } from "@/features/projects/queries";
import { db } from "@/lib/db";

export const RECENT_TASKS_LIMIT = 10;
export const DASHBOARD_PROJECTS_LIMIT = 6;

/**
 * ダッシュボードの集計。対象はログインユーザーが所属するプロジェクトのみ。
 * @param today アプリのタイムゾーンでの今日（"YYYY-MM-DD"）。期限切れ判定に使う
 */
export async function getDashboard(userId: string, today: string) {
  const myProjects: Prisma.ProjectWhereInput = { members: { some: { userId } } };
  const openTasks: Prisma.TaskWhereInput = { project: myProjects, status: { not: "DONE" } };

  const [projectCounts, openTaskCount, overdueTaskCount, recentTasks, projects] = await Promise.all([
    db.project.groupBy({ by: ["status"], where: myProjects, _count: { _all: true } }),
    db.task.count({ where: openTasks }),
    db.task.count({ where: { ...openTasks, dueDate: { lt: parseDateOnly(today) } } }),
    // 直近のタスク: 未完了で期限があるものを期限が近い順に（期限切れを含む）
    db.task.findMany({
      where: { ...openTasks, dueDate: { not: null } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { id: "asc" }],
      take: RECENT_TASKS_LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignee: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    listProjectsForUser(userId, { q: "", sort: "updated", page: 1, status: undefined }),
  ]);

  const countByStatus = (status: string) =>
    projectCounts.find((row) => row.status === status)?._count._all ?? 0;

  return {
    stats: {
      totalProjects: projectCounts.reduce((sum, row) => sum + row._count._all, 0),
      inProgressProjects: countByStatus("IN_PROGRESS"),
      completedProjects: countByStatus("COMPLETED"),
      openTasks: openTaskCount,
      overdueTasks: overdueTaskCount,
    },
    recentTasks,
    projects: projects.items.slice(0, DASHBOARD_PROJECTS_LIMIT),
    hasMoreProjects: projects.total > DASHBOARD_PROJECTS_LIMIT,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
