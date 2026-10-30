import { z } from "zod";
import { m } from "@/i18n";
import {
  idSchema,
  isDateRangeValid,
  optionalDateOnly,
  optionalText,
  requiredText,
} from "@/lib/validation";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 5000;

/** タスク作成・更新の入力（クライアントとサーバーで共有） */
export const taskInputSchema = z
  .object({
    title: requiredText(TASK_TITLE_MAX),
    description: optionalText(TASK_DESCRIPTION_MAX),
    status: z.enum(TASK_STATUSES, { error: m.validation.invalidOption }),
    priority: z.enum(TASK_PRIORITIES, { error: m.validation.invalidOption }),
    assigneeId: idSchema.nullish().transform((value) => value ?? null),
    startDate: optionalDateOnly,
    dueDate: optionalDateOnly,
  })
  .refine(isDateRangeValid, { error: m.validation.dateOrder, path: ["dueDate"] });

export type TaskInput = z.output<typeof taskInputSchema>;
export type TaskFormValues = z.input<typeof taskInputSchema>;
