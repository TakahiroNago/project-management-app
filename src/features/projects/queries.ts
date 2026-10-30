import "server-only";
import { cache } from "react";
import { calculateProgress } from "@/domain/progress";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PROJECTS_PER_PAGE, type ProjectListQuery, type ProjectSort } from "./schemas";

const ORDER_BY: Record<ProjectSort, Prisma.ProjectOrderByWithRelationInput[]> = {
  updated: [{ updatedAt: "desc" }, { id: "asc" }],
  created: [{ createdAt: "desc" }, { id: "asc" }],
  dueDate: [{ dueDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }],
  name: [{ name: "asc" }, { id: "asc" }],
};

/** プロジェクトごとの (全タスク数, 完了タスク数) を 1 クエリで集計する */
async function countTasksByProject(projectIds: string[]) {
  const counts = new Map<string, { total: number; done: number }>();
  if (projectIds.length === 0) return counts;

  const rows = await db.task.groupBy({
    by: ["projectId", "status"],
    where: { projectId: { in: projectIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const entry = counts.get(row.projectId) ?? { total: 0, done: 0 };
    entry.total += row._count._all;
    if (row.status === "DONE") entry.done += row._count._all;
    counts.set(row.projectId, entry);
  }
  return counts;
}

/** ログインユーザーが所属するプロジェクトの一覧（検索・絞り込み・並べ替え・ページネーション） */
export async function listProjectsForUser(userId: string, query: ProjectListQuery) {
  const where: Prisma.ProjectWhereInput = {
    members: { some: { userId } },
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [total, projects] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * PROJECTS_PER_PAGE,
      take: PROJECTS_PER_PAGE,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        startDate: true,
        dueDate: true,
        updatedAt: true,
        members: { where: { userId }, select: { role: true } },
      },
    }),
  ]);

  const counts = await countTasksByProject(projects.map((p) => p.id));

  return {
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PROJECTS_PER_PAGE)),
    items: projects.map(({ members, ...project }) => {
      const { total: taskCount, done: doneCount } = counts.get(project.id) ?? { total: 0, done: 0 };
      return {
        ...project,
        role: members[0].role,
        taskCount,
        doneCount,
        progress: calculateProgress(doneCount, taskCount),
      };
    }),
  };
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjectsForUser>>["items"][number];

/**
 * プロジェクト詳細。ユーザーがメンバーでなければ null（呼び出し側で notFound() にする）。
 * レイアウトとページの両方から呼ばれるため、リクエスト内でキャッシュする。
 */
export const getProjectForUser = cache(async (userId: string, projectId: string) => {
  const project = await db.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    include: { members: { where: { userId }, select: { role: true } } },
  });
  if (!project) return null;

  const { members, ...rest } = project;
  const counts = await countTasksByProject([project.id]);
  const { total: taskCount, done: doneCount } = counts.get(project.id) ?? { total: 0, done: 0 };

  return {
    ...rest,
    role: members[0].role,
    taskCount,
    doneCount,
    progress: calculateProgress(doneCount, taskCount),
  };
});

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectForUser>>>;
