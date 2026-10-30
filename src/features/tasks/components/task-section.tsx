"use client";

import { CalendarDays, MoreHorizontal, Pencil, Plus, Trash2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PriorityBadge, TaskStatusBadge } from "@/components/status-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isOverdue, toDateOnlyString } from "@/domain/dates";
import { m } from "@/i18n";
import { formatDate } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { deleteTaskAction } from "../actions";
import type { AssignableMember, TaskListItem } from "../queries";
import type { TaskFormValues } from "../schemas";
import { EMPTY_TASK_VALUES, TaskFormDialog } from "./task-form-dialog";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; task: TaskListItem }
  | { mode: "delete"; task: TaskListItem };

function toFormValues(task: TaskListItem): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    status: task.status,
    priority: task.priority,
    assigneeId: task.assignee?.id ?? null,
    startDate: task.startDate ? toDateOnlyString(task.startDate) : "",
    dueDate: task.dueDate ? toDateOnlyString(task.dueDate) : "",
  };
}

export function TaskSection({
  projectId,
  tasks,
  members,
  today,
}: {
  projectId: string;
  tasks: TaskListItem[];
  members: AssignableMember[];
  /** アプリのタイムゾーンでの今日（"YYYY-MM-DD"）。サーバーで算出して渡す */
  today: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [isDeleting, startDelete] = useTransition();
  const close = () => setDialog({ mode: "closed" });

  function onDelete(task: TaskListItem) {
    startDelete(async () => {
      const result = await deleteTaskAction(task.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(m.task.deleted);
      close();
      router.refresh();
    });
  }

  return (
    <section className="space-y-4" aria-labelledby="tasks-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          {m.task.listTitle} <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span>
        </h2>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus /> {m.task.newButton}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{m.task.empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="task-list">
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status === "DONE", today);
            return (
              <li key={task.id} className="flex items-start gap-3 p-3 sm:items-center sm:p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className={cn("font-medium break-words", task.status === "DONE" && "text-muted-foreground line-through")}>
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <TaskStatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                    <span className="flex items-center gap-1">
                      <User className="size-3.5" />
                      {task.assignee?.name ?? m.task.unassigned}
                    </span>
                    {task.dueDate && (
                      <span className={cn("flex items-center gap-1", overdue && "font-medium text-destructive")}>
                        <CalendarDays className="size-3.5" />
                        {formatDate(task.dueDate)}
                        {overdue && ` (${m.task.overdue})`}
                      </span>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`${m.common.actions}: ${task.title}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", task })}>
                      <Pencil /> {m.common.edit}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ mode: "delete", task })}>
                      <Trash2 /> {m.common.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <TaskFormDialog
        open={dialog.mode === "create" || dialog.mode === "edit"}
        onOpenChange={(open) => !open && close()}
        members={members}
        target={dialog.mode === "edit" ? { mode: "edit", taskId: dialog.task.id } : { mode: "create", projectId }}
        defaultValues={dialog.mode === "edit" ? toFormValues(dialog.task) : EMPTY_TASK_VALUES}
      />

      <AlertDialog open={dialog.mode === "delete"} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.task.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {dialog.mode === "delete" && m.task.deleteDescription(dialog.task.title)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{m.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                if (dialog.mode === "delete") onDelete(dialog.task);
              }}
            >
              {isDeleting ? m.common.deleting : m.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
