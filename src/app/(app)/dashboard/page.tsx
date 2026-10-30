import { FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PriorityBadge, ProjectStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { todayInTimeZone } from "@/domain/dates";
import { StatTiles } from "@/features/dashboard/components/stat-tiles";
import { getDashboard } from "@/features/dashboard/queries";
import { DueDate } from "@/features/tasks/components/due-date";
import { APP_TIME_ZONE, m } from "@/i18n";
import { formatPercent } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: m.dashboard.title };

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayInTimeZone(APP_TIME_ZONE);
  const { stats, recentTasks, projects, hasMoreProjects } = await getDashboard(user.id, today);

  return (
    <div className="space-y-6">
      <PageHeader title={m.dashboard.title} description={m.dashboard.welcome(user.name)} />
      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{m.dashboard.recentTasks}</CardTitle>
            <CardDescription>{m.dashboard.recentTasksDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{m.dashboard.noRecentTasks}</p>
            ) : (
              <ul className="divide-y" data-testid="recent-tasks">
                {recentTasks.map((task) => (
                  <li key={task.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/projects/${task.project.id}/board`}
                      className="group block space-y-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-medium break-words group-hover:underline">
                          {task.title}
                        </span>
                        <PriorityBadge priority={task.priority} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="truncate">{task.project.name}</span>
                        <DueDate dueDate={task.dueDate} isDone={false} today={today} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <CardTitle>{m.dashboard.projectProgress}</CardTitle>
            {hasMoreProjects && (
              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href="/projects">{m.dashboard.toProjects}</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <FolderKanban className="size-8 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">{m.dashboard.noProjects}</p>
                <Button asChild size="sm">
                  <Link href="/projects/new">
                    <Plus /> {m.dashboard.createFirst}
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-4" data-testid="project-progress">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="group block space-y-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium group-hover:underline">{project.name}</span>
                          <ProjectStatusBadge status={project.status} />
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{formatPercent(project.progress)}</span>
                      </div>
                      <Progress value={project.progress} aria-label={`${project.name} ${m.project.progress}`} />
                      <p className="text-xs text-muted-foreground">
                        {m.project.tasksCount(project.doneCount, project.taskCount)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
