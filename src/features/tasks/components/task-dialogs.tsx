"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { toDateOnlyString } from "@/domain/dates";
import { m } from "@/i18n";
import { deleteTaskAction } from "../actions";
import type { AssignableMember, TaskListItem } from "../queries";
import type { TaskFormValues, TaskStatusValue } from "../schemas";
import { TaskDetailDialog } from "./task-detail-dialog";
import { EMPTY_TASK_VALUES, TaskFormDialog } from "./task-form-dialog";

export type TaskDialogState =
  | { mode: "closed" }
  | { mode: "create"; status?: TaskStatusValue }
  | { mode: "detail"; task: TaskListItem }
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

export function useTaskDialogs() {
  const [state, setState] = useState<TaskDialogState>({ mode: "closed" });
  return {
    state,
    setState,
    openCreate: (status?: TaskStatusValue) => setState({ mode: "create", status }),
    openDetail: (task: TaskListItem) => setState({ mode: "detail", task }),
    openEdit: (task: TaskListItem) => setState({ mode: "edit", task }),
    openDelete: (task: TaskListItem) => setState({ mode: "delete", task }),
  };
}

/** タスクの作成・詳細・編集・削除ダイアログをまとめて描画する */
export function TaskDialogs({
  dialogs,
  projectId,
  members,
  today,
}: {
  dialogs: ReturnType<typeof useTaskDialogs>;
  projectId: string;
  members: AssignableMember[];
  today: string;
}) {
  const router = useRouter();
  const { state, setState } = dialogs;
  const [isDeleting, startDelete] = useTransition();
  const close = () => setState({ mode: "closed" });

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
    <>
      <TaskDetailDialog
        task={state.mode === "detail" ? state.task : null}
        today={today}
        onOpenChange={(open) => !open && close()}
        onEdit={dialogs.openEdit}
        onDelete={dialogs.openDelete}
      />

      <TaskFormDialog
        open={state.mode === "create" || state.mode === "edit"}
        onOpenChange={(open) => !open && close()}
        members={members}
        target={state.mode === "edit" ? { mode: "edit", taskId: state.task.id } : { mode: "create", projectId }}
        defaultValues={
          state.mode === "edit"
            ? toFormValues(state.task)
            : { ...EMPTY_TASK_VALUES, status: (state.mode === "create" && state.status) || "TODO" }
        }
      />

      <AlertDialog open={state.mode === "delete"} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.task.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {state.mode === "delete" && m.task.deleteDescription(state.task.title)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{m.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                // 削除完了までダイアログを閉じない
                event.preventDefault();
                if (state.mode === "delete") onDelete(state.task);
              }}
            >
              {isDeleting ? m.common.deleting : m.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
