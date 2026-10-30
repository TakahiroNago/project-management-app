"use client";

import { MoreHorizontal, Pencil, Plus, Trash2, User } from "lucide-react";
import { PriorityBadge, TaskStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/i18n";
import { cn } from "@/lib/utils";
import type { AssignableMember, TaskListItem } from "../queries";
import type { TaskThread } from "../thread";
import { DueDate } from "./due-date";
import { TaskDialogs, useTaskDialogs } from "./task-dialogs";

/** プロジェクト概要のタスク一覧（リスト表示） */
export function TaskSection({
  projectId,
  tasks,
  members,
  today,
  thread,
  currentUserId,
}: {
  projectId: string;
  tasks: TaskListItem[];
  members: AssignableMember[];
  thread: TaskThread | null;
  currentUserId: string;
  /** アプリのタイムゾーンでの今日（"YYYY-MM-DD"）。サーバーで算出して渡す */
  today: string;
}) {
  const dialogs = useTaskDialogs();

  return (
    <section className="space-y-4" aria-labelledby="tasks-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          {m.task.listTitle} <span className="text-sm font-normal text-muted-foreground">({tasks.length})</span>
        </h2>
        <Button onClick={() => dialogs.openCreate()}>
          <Plus /> {m.task.newButton}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{m.task.empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="task-list">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-3 p-3 sm:items-center sm:p-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <button
                  type="button"
                  onClick={() => dialogs.openDetail(task)}
                  aria-label={m.task.openDetail(task.title)}
                  className={cn(
                    "text-left font-medium break-words hover:underline focus-visible:underline focus-visible:outline-none",
                    task.status === "DONE" && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </button>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <TaskStatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                  <span className="flex items-center gap-1">
                    <User className="size-3.5" />
                    {task.assignee?.name ?? m.task.unassigned}
                  </span>
                  <DueDate dueDate={task.dueDate} isDone={task.status === "DONE"} today={today} />
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`${m.common.actions}: ${task.title}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => dialogs.openEdit(task)}>
                    <Pencil /> {m.common.edit}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => dialogs.openDelete(task)}>
                    <Trash2 /> {m.common.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <TaskDialogs
        dialogs={dialogs}
        projectId={projectId}
        members={members}
        today={today}
        tasks={tasks}
        thread={thread}
        currentUserId={currentUserId}
      />
    </section>
  );
}
