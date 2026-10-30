import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { todayInTimeZone } from "@/domain/dates";
import { KanbanBoard } from "@/features/board/components/kanban-board";
import { getProjectForUser } from "@/features/projects/queries";
import { listAssignableMembers, listTasksForProject } from "@/features/tasks/queries";
import { getTaskThread } from "@/features/tasks/thread";
import { APP_TIME_ZONE, m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]/board">): Promise<Metadata> {
  const user = await requireUser();
  const project = await getProjectForUser(user.id, (await params).projectId);
  return { title: project ? `${m.project.tabs.board} - ${project.name}` : m.errors.pageNotFound };
}

export default async function BoardPage({ params, searchParams }: PageProps<"/projects/[projectId]/board">) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  // ?task=<id> が指定されていれば、そのタスクのコメント・履歴も取得する（詳細ダイアログ）
  const { task: selectedTaskId } = await searchParams;
  const [tasks, members, thread] = await Promise.all([
    listTasksForProject(user.id, project.id),
    listAssignableMembers(user.id, project.id),
    typeof selectedTaskId === "string" ? getTaskThread(user.id, project.id, selectedTaskId) : null,
  ]);

  return (
    <KanbanBoard
      projectId={project.id}
      tasks={tasks}
      members={members}
      thread={thread}
      currentUserId={user.id}
      today={todayInTimeZone(APP_TIME_ZONE)}
    />
  );
}
