"use client";

import { Pencil, Trash2 } from "lucide-react";
import { PriorityBadge, TaskStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CommentSection } from "@/features/comments/components/comment-section";
import { m } from "@/i18n";
import { formatDate, formatDateTime } from "@/i18n/format";
import type { TaskListItem } from "../queries";
import type { TaskThread } from "../thread";
import { ActivityList } from "./activity-list";
import { DueDate } from "./due-date";

/** タスク詳細（項目・コメント・更新履歴）。編集・削除は親のダイアログを開く */
export function TaskDetailDialog({
  task,
  thread,
  currentUserId,
  today,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  task: TaskListItem | null;
  thread: TaskThread | null;
  currentUserId: string;
  today: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: TaskListItem) => void;
  onDelete: (task: TaskListItem) => void;
}) {
  return (
    <Dialog open={task !== null && thread !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {task && thread && (
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onDelete(task)}>
                <Trash2 /> {m.common.delete}
              </Button>
              <Button size="sm" onClick={() => onEdit(task)}>
                <Pencil /> {m.common.edit}
              </Button>
            </div>
            <Separator />
            <CommentSection taskId={task.id} comments={thread.comments} currentUserId={currentUserId} />
            <Separator />
            <ActivityList activity={thread.activity} userNames={thread.userNames} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
