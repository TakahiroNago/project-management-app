"use client";

import type { DraggableAttributes } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, User } from "lucide-react";
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
  /** キーボード・スクリーンリーダー向けのドラッグハンドル（要素の登録関数と属性） */
  handleRef?: (element: HTMLElement | null) => void;
  handleAttributes?: DraggableAttributes;
};

/**
 * カンバンのカード。
 * 操作できる要素はドラッグハンドルとタスク名（詳細を開く）の 2 つで、入れ子にしない。
 * マウス・タッチではカード全体をドラッグできる（リスナーは親の SortableKanbanCard に設定）。
 */
export function KanbanCard({ task, today, overlay, onOpen, handleRef, handleAttributes }: CardProps) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border bg-card p-3 text-sm shadow-xs",
        overlay && "cursor-grabbing shadow-lg ring-2 ring-ring/30",
      )}
    >
      <div className="flex items-start gap-1">
        {handleAttributes ? (
          <button
            ref={handleRef}
            type="button"
            {...handleAttributes}
            aria-label={m.task.dragHandle(task.title)}
            aria-roledescription={m.task.dragRole}
            className="-ml-1.5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        ) : (
          <GripVertical className="-ml-1.5 size-5 shrink-0 p-0.5 text-muted-foreground" aria-hidden />
        )}
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            // カードに設定したキーボード操作（ドラッグ開始）と競合しないようにする
            onKeyDown={(event) => event.stopPropagation()}
            aria-label={m.task.openDetail(task.title)}
            className={cn(
              "min-w-0 flex-1 text-left font-medium break-words hover:underline focus-visible:underline focus-visible:outline-none",
              task.status === "DONE" && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </button>
        ) : (
          <span className="min-w-0 flex-1 font-medium break-words">{task.title}</span>
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

export function SortableKanbanCard({ task, today, onOpen }: Omit<CardProps, "overlay" | "handleRef" | "handleAttributes">) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="kanban-card"
      data-task-title={task.title}
      className={cn("cursor-grab touch-manipulation rounded-lg", isDragging && "opacity-40")}
      // マウス・タッチ・キーボードのリスナーはカード全体に設定する（キー操作はハンドルから伝わる）
      {...listeners}
    >
      <KanbanCard
        task={task}
        today={today}
        onOpen={onOpen}
        handleRef={setActivatorNodeRef}
        handleAttributes={attributes}
      />
    </div>
  );
}
