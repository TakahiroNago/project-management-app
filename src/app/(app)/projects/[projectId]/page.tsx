import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { todayInTimeZone } from "@/domain/dates";
import { getProjectForUser } from "@/features/projects/queries";
import { TaskSection } from "@/features/tasks/components/task-section";
import { listAssignableMembers, listTasksForProject } from "@/features/tasks/queries";
import { APP_TIME_ZONE, m } from "@/i18n";
import { formatDate, formatDateTime, formatPercent } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const user = await requireUser();
  const project = await getProjectForUser(user.id, (await params).projectId);
  return { title: project?.name ?? m.errors.pageNotFound };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  const [tasks, members] = await Promise.all([
    listTasksForProject(user.id, project.id),
    listAssignableMembers(user.id, project.id),
  ]);

  const details = [
    { label: m.project.fields.startDate, value: formatDate(project.startDate) },
    { label: m.project.fields.dueDate, value: formatDate(project.dueDate) },
    { label: m.project.fields.createdAt, value: formatDateTime(project.createdAt) },
    { label: m.project.fields.updatedAt, value: formatDateTime(project.updatedAt) },
  ];

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{m.project.fields.description}</h2>
            <p className="text-sm whitespace-pre-wrap break-words">{project.description || m.common.notSet}</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{m.project.progress}</span>
                <span className="font-medium">{formatPercent(project.progress)}</span>
              </div>
              <Progress value={project.progress} aria-label={m.project.progress} />
              <p className="text-xs text-muted-foreground">{m.project.tasksCount(project.doneCount, project.taskCount)}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {details.map((item) => (
                <div key={item.label} className="contents">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>
      <TaskSection
        projectId={project.id}
        tasks={tasks}
        members={members}
        today={todayInTimeZone(APP_TIME_ZONE)}
      />
    </div>
  );
}
