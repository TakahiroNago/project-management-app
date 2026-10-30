"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { InputField, SelectField, TextareaField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { m } from "@/i18n";
import { applyFieldErrors } from "@/lib/form";
import { createTaskAction, updateTaskAction } from "../actions";
import type { AssignableMember } from "../queries";
import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  type TaskFormValues,
  type TaskInput,
  taskInputSchema,
} from "../schemas";

const UNASSIGNED = "__unassigned__";
const STATUS_OPTIONS = TASK_STATUSES.map((value) => ({ value, label: m.task.status[value] }));
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((value) => ({ value, label: m.task.priority[value] }));

export const EMPTY_TASK_VALUES: TaskFormValues = {
  title: "",
  description: "",
  status: "TODO",
  priority: "MEDIUM",
  assigneeId: null,
  startDate: "",
  dueDate: "",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: AssignableMember[];
  /** create: プロジェクト ID / edit: タスク ID */
  target: { mode: "create"; projectId: string } | { mode: "edit"; taskId: string };
  defaultValues: TaskFormValues;
};

export function TaskFormDialog({ open, onOpenChange, members, target, defaultValues }: Props) {
  const router = useRouter();
  const form = useForm<TaskFormValues, unknown, TaskInput>({
    resolver: zodResolver(taskInputSchema),
    values: defaultValues,
  });
  const { errors, isSubmitting } = form.formState;
  const assigneeOptions = [
    { value: UNASSIGNED, label: m.task.unassigned },
    ...members.map((member) => ({ value: member.id, label: member.name })),
  ];

  const onSubmit = form.handleSubmit(async (values) => {
    const result =
      target.mode === "create"
        ? await createTaskAction(target.projectId, values)
        : await updateTaskAction(target.taskId, values);
    if (!result.ok) {
      applyFieldErrors(form.setError, result.fieldErrors);
      toast.error(result.error);
      return;
    }
    toast.success(target.mode === "create" ? m.task.created : m.task.updated);
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.mode === "create" ? m.task.newTitle : m.task.editTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {target.mode === "create" ? m.task.newTitle : m.task.editTitle}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <InputField
              id="task-title"
              label={m.task.fields.title}
              maxLength={TASK_TITLE_MAX}
              error={errors.title}
              {...form.register("title")}
            />
            <TextareaField
              id="task-description"
              label={m.task.fields.description}
              rows={3}
              maxLength={TASK_DESCRIPTION_MAX}
              error={errors.description}
              {...form.register("description")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <SelectField
                    id="task-status"
                    label={m.task.fields.status}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={STATUS_OPTIONS}
                    error={errors.status}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <SelectField
                    id="task-priority"
                    label={m.task.fields.priority}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={PRIORITY_OPTIONS}
                    error={errors.priority}
                  />
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <SelectField
                  id="task-assignee"
                  label={m.task.fields.assignee}
                  value={field.value ?? UNASSIGNED}
                  onValueChange={(value) => field.onChange(value === UNASSIGNED ? null : value)}
                  options={assigneeOptions}
                  error={errors.assigneeId}
                />
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                id="task-start-date"
                type="date"
                label={m.task.fields.startDate}
                error={errors.startDate}
                {...form.register("startDate")}
              />
              <InputField
                id="task-due-date"
                type="date"
                label={m.task.fields.dueDate}
                error={errors.dueDate}
                {...form.register("dueDate")}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {m.common.cancel}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? m.common.saving : target.mode === "create" ? m.common.create : m.common.save}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
