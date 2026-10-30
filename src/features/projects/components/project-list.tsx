import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { ProjectStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { m } from "@/i18n";
import { formatDate, formatPercent } from "@/i18n/format";
import type { ProjectListItem } from "../queries";

export function ProjectList({ projects }: { projects: ProjectListItem[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ProjectStatusBadge status={project.status} />
                  {project.role === "OWNER" && <Badge variant="outline">{m.project.role.OWNER}</Badge>}
                </div>
                <CardTitle className="line-clamp-2 break-words">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="line-clamp-2 break-words">{project.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{m.project.tasksCount(project.doneCount, project.taskCount)}</span>
                    <span className="font-medium text-foreground">{formatPercent(project.progress)}</span>
                  </div>
                  <Progress value={project.progress} aria-label={m.project.progress} />
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {m.project.fields.dueDate}: {formatDate(project.dueDate)}
                </p>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
