import { formatDate, formatDateTime } from "@/i18n/format";
import { parseDateOnly } from "@/domain/dates";
import { m } from "@/i18n";
import type { TaskPriorityValue, TaskStatusValue } from "../schemas";
import type { TaskThread } from "../thread";

type Log = TaskThread["activity"][number];

/** 履歴の値を表示用の文言に変換する */
function describe(log: Log, userNames: Record<string, string>): string {
  const user = log.user?.name ?? m.activity.unknownUser;
  const none = m.activity.none;
  switch (log.action) {
    case "TASK_CREATED":
      return m.activity.TASK_CREATED(user);
    case "STATUS_CHANGED": {
      const label = (v: string | null) => (v ? (m.task.status[v as TaskStatusValue] ?? v) : none);
      return m.activity.STATUS_CHANGED(user, label(log.oldValue), label(log.newValue));
    }
    case "PRIORITY_CHANGED": {
      const label = (v: string | null) => (v ? (m.task.priority[v as TaskPriorityValue] ?? v) : none);
      return m.activity.PRIORITY_CHANGED(user, label(log.oldValue), label(log.newValue));
    }
    case "DUE_DATE_CHANGED": {
      const label = (v: string | null) => (v ? formatDate(parseDateOnly(v)) : none);
      return m.activity.DUE_DATE_CHANGED(user, label(log.oldValue), label(log.newValue));
    }
    case "ASSIGNEE_CHANGED": {
      const label = (v: string | null) => (v ? (userNames[v] ?? m.activity.unknownUser) : none);
      return m.activity.ASSIGNEE_CHANGED(user, label(log.oldValue), label(log.newValue));
    }
  }
}

/** 更新履歴（新しい順）: 誰が・いつ・何を変更したか */
export function ActivityList({ activity, userNames }: { activity: Log[]; userNames: Record<string, string> }) {
  return (
    <section className="space-y-3" aria-labelledby="activity-heading">
      <h3 id="activity-heading" className="text-sm font-semibold">
        {m.activity.title}
      </h3>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.activity.empty}</p>
      ) : (
        <ol className="space-y-2 border-l pl-4" data-testid="activity">
          {activity.map((log) => (
            <li key={log.id} className="relative text-sm">
              <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
              <p className="break-words">{describe(log, userNames)}</p>
              <time className="text-xs text-muted-foreground" dateTime={log.createdAt.toISOString()}>
                {formatDateTime(log.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
