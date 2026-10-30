"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskColumn } from "@/domain/task-position";
import type { TaskListItem } from "@/features/tasks/queries";
import { m } from "@/i18n";
import { cn } from "@/lib/utils";
import { SortableKanbanCard } from "./kanban-card";

export function KanbanColumn({
  status,
  tasks,
  today,
  onAdd,
  onOpenTask,
}: {
  status: TaskColumn;
  tasks: TaskListItem[];
  today: string;
  onAdd: () => void;
  onOpenTask: (task: TaskListItem) => void;
}) {
  // 空の列にもドロップできるよう、列自体をドロップ先にする
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label = m.task.status[status];

  return (
    <section
      aria-label={label}
      data-testid={`column-${status}`}
      className={cn(
        "flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl bg-muted/50 sm:w-80 lg:w-auto lg:max-w-none",
        isOver && "ring-2 ring-ring/40",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {label}
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">
            {tasks.length}
          </span>
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label={`${label}: ${m.task.newButton}`}>
          <Plus />
        </Button>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 px-3 pb-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <SortableKanbanCard task={task} today={today} onOpen={() => onOpenTask(task)} />
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {m.task.boardEmptyColumn}
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}
