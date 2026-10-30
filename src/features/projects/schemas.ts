import { z } from "zod";
import { m } from "@/i18n";
import { isDateRangeValid, optionalDateOnly, optionalText, requiredText } from "@/lib/validation";

export const PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "COMPLETED", "ON_HOLD"] as const;
export type ProjectStatusValue = (typeof PROJECT_STATUSES)[number];

export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESCRIPTION_MAX = 2000;

/** プロジェクト作成・更新の入力（クライアントのフォームとサーバーの Server Action で共有） */
export const projectInputSchema = z
  .object({
    name: requiredText(PROJECT_NAME_MAX),
    description: optionalText(PROJECT_DESCRIPTION_MAX),
    status: z.enum(PROJECT_STATUSES, { error: m.validation.invalidOption }),
    startDate: optionalDateOnly,
    dueDate: optionalDateOnly,
  })
  .refine(isDateRangeValid, { error: m.validation.dateOrder, path: ["dueDate"] });

export type ProjectInput = z.output<typeof projectInputSchema>;
export type ProjectFormValues = z.input<typeof projectInputSchema>;

export const PROJECT_SORTS = ["updated", "created", "dueDate", "name"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export const PROJECTS_PER_PAGE = 20;

/** 一覧画面の URL searchParams。不正な値はエラーにせず既定値に戻す */
export const projectListQuerySchema = z.object({
  q: z.string().trim().max(PROJECT_NAME_MAX).catch("").default(""),
  status: z.enum(PROJECT_STATUSES).optional().catch(undefined),
  sort: z.enum(PROJECT_SORTS).catch("updated").default("updated"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1).default(1),
});

export type ProjectListQuery = z.output<typeof projectListQuerySchema>;
