import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { todayInTimeZone } from "@/domain/dates";
import { KanbanBoard } from "@/features/board/components/kanban-board";
import { getProjectForUser } from "@/features/projects/queries";
import { listAssignableMembers, listTasksForProject } from "@/features/tasks/queries";
import { APP_TIME_ZONE, m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]/board">): Promise<Metadata> {
  const user = await requireUser();
  const project = await getProjectForUser(user.id, (await params).projectId);
  return { title: project ? `${m.project.tabs.board} - ${project.name}` : m.errors.pageNotFound };
}

export default async function BoardPage({ params }: PageProps<"/projects/[projectId]/board">) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  const [tasks, members] = await Promise.all([
    listTasksForProject(user.id, project.id),
    listAssignableMembers(user.id, project.id),
  ]);

  return (
    <KanbanBoard
      projectId={project.id}
      tasks={tasks}
      members={members}
      today={todayInTimeZone(APP_TIME_ZONE)}
    />
  );
}
