"use client";

import { Pencil, Trash2 } from "lucide-react";
import { PriorityBadge, TaskStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { m } from "@/i18n";
import { formatDate, formatDateTime } from "@/i18n/format";
import type { TaskListItem } from "../queries";
import { DueDate } from "./due-date";

/** タスク詳細（閲覧用）。編集・削除は親コンポーネントのダイアログを開く */
export function TaskDetailDialog({
  task,
  today,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  task: TaskListItem | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: TaskListItem) => void;
  onDelete: (task: TaskListItem) => void;
}) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 break-words">{task.title}</DialogTitle>
              <DialogDescription className="sr-only">{m.task.detailTitle}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <TaskStatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{m.task.fields.assignee}</dt>
              <dd className="break-words">{task.assignee?.name ?? m.task.unassigned}</dd>
              <dt className="text-muted-foreground">{m.task.fields.startDate}</dt>
              <dd>{formatDate(task.startDate)}</dd>
              <dt className="text-muted-foreground">{m.task.fields.dueDate}</dt>
              <dd>
                {task.dueDate ? (
                  <DueDate dueDate={task.dueDate} isDone={task.status === "DONE"} today={today} />
                ) : (
                  m.common.notSet
                )}
              </dd>
              <dt className="text-muted-foreground">{m.project.fields.createdAt}</dt>
              <dd>{formatDateTime(task.createdAt)}</dd>
              <dt className="text-muted-foreground">{m.project.fields.updatedAt}</dt>
              <dd>{formatDateTime(task.updatedAt)}</dd>
            </dl>
            <section className="space-y-1">
              <h3 className="text-sm text-muted-foreground">{m.task.fields.description}</h3>
              <p className="text-sm whitespace-pre-wrap break-words">{task.description || m.common.notSet}</p>
            </section>
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">{m.task.commentsComingSoon}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onDelete(task)}>
                <Trash2 /> {m.common.delete}
              </Button>
              <Button onClick={() => onEdit(task)}>
                <Pencil /> {m.common.edit}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
