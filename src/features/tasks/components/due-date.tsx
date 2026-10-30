import { AlertTriangle, CalendarDays, Clock } from "lucide-react";
import { daysBetween, getDueState, toDateOnlyString } from "@/domain/dates";
import { m } from "@/i18n";
import { formatDate } from "@/i18n/format";
import { cn } from "@/lib/utils";

/**
 * 期限の表示。期限切れ・今日・間近は色だけでなくアイコンと文言でも示す。
 * @param today アプリのタイムゾーンでの今日（"YYYY-MM-DD"）
 */
export function DueDate({
  dueDate,
  isDone,
  today,
  className,
}: {
  dueDate: Date | null;
  isDone: boolean;
  today: string;
  className?: string;
}) {
  if (!dueDate) return null;
  const state = getDueState(dueDate, isDone, today);
  const days = daysBetween(today, toDateOnlyString(dueDate));

  const note =
    state === "overdue"
      ? m.task.due.overdue(-days)
      : state === "today"
        ? m.task.due.today
        : state === "soon"
          ? m.task.due.soon(days)
          : null;
  const Icon = state === "overdue" ? AlertTriangle : state === "today" || state === "soon" ? Clock : CalendarDays;

  return (
    <span
      data-due-state={state}
      className={cn(
        "inline-flex items-center gap-1",
        state === "overdue" && "font-medium text-destructive",
        (state === "today" || state === "soon") && "font-medium text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>
        {formatDate(dueDate)}
        {note && ` · ${note}`}
      </span>
    </span>
  );
}
