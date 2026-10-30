"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { User } from "lucide-react";
import { PriorityBadge } from "@/components/status-badges";
import { DueDate } from "@/features/tasks/components/due-date";
import type { TaskListItem } from "@/features/tasks/queries";
import { m } from "@/i18n";
import { cn } from "@/lib/utils";

type CardProps = {
  task: TaskListItem;
  today: string;
  /** ドラッグ中に指に追従する表示（DragOverlay） */
  overlay?: boolean;
  onOpen?: () => void;
};

export function KanbanCard({ task, today, overlay, onOpen }: CardProps) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border bg-card p-3 text-sm shadow-xs",
        overlay && "cursor-grabbing shadow-lg ring-2 ring-ring/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            // カード本体のキーボード操作（ドラッグ開始）と競合しないようにする
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={m.task.openDetail(task.title)}
            className={cn(
              "min-w-0 text-left font-medium break-words hover:underline focus-visible:underline focus-visible:outline-none",
              task.status === "DONE" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </button>
        ) : (
          <span className="min-w-0 font-medium break-words">{task.title}</span>
        )}
        <PriorityBadge priority={task.priority} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          <User className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{task.assignee?.name ?? m.task.unassigned}</span>
        </span>
        <DueDate dueDate={task.dueDate} isDone={task.status === "DONE"} today={today} />
      </div>
    </div>
  );
}

export function SortableKanbanCard({ task, today, onOpen }: Omit<CardProps, "overlay">) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="kanban-card"
      data-task-title={task.title}
      className={cn(
        "cursor-grab touch-manipulation rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isDragging && "opacity-40",
      )}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable"
      aria-label={task.title}
    >
      <KanbanCard task={task} today={today} onOpen={onOpen} />
    </div>
  );
}
