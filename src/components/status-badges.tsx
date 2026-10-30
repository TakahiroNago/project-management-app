import { Badge } from "@/components/ui/badge";
import type { ProjectStatusValue } from "@/features/projects/schemas";
import type { TaskPriorityValue, TaskStatusValue } from "@/features/tasks/schemas";
import { m } from "@/i18n";
import { cn } from "@/lib/utils";

const PROJECT_STATUS_STYLES: Record<ProjectStatusValue, string> = {
  PLANNING: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ON_HOLD: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const TASK_STATUS_STYLES: Record<TaskStatusValue, string> = {
  TODO: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  DONE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const PRIORITY_STYLES: Record<TaskPriorityValue, string> = {
  LOW: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  MEDIUM: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  HIGH: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatusValue }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", PROJECT_STATUS_STYLES[status])}>
      {m.project.status[status]}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatusValue }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", TASK_STATUS_STYLES[status])}>
      {m.task.status[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriorityValue }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", PRIORITY_STYLES[priority])}>
      {m.task.priority[priority]}
    </Badge>
  );
}
