/**
 * タスクの更新履歴の差分算出（純粋関数）。
 * 記録対象: ステータス・担当者・期限・優先度の変更（要件 3.5）。
 */
export type TrackedAction = "STATUS_CHANGED" | "ASSIGNEE_CHANGED" | "DUE_DATE_CHANGED" | "PRIORITY_CHANGED";

/** 比較対象のタスクの値。期限は "YYYY-MM-DD"、担当者はユーザー ID（未設定は null） */
export type TrackedTaskFields = {
  status: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: string;
};

export type ActivityChange = {
  action: TrackedAction;
  oldValue: string | null;
  newValue: string | null;
};

const TRACKED: readonly [keyof TrackedTaskFields, TrackedAction][] = [
  ["status", "STATUS_CHANGED"],
  ["assigneeId", "ASSIGNEE_CHANGED"],
  ["dueDate", "DUE_DATE_CHANGED"],
  ["priority", "PRIORITY_CHANGED"],
];

/** 変更前後を比べ、変わった項目ごとに履歴を 1 件返す（変更がなければ空） */
export function diffTaskChanges(before: TrackedTaskFields, after: TrackedTaskFields): ActivityChange[] {
  return TRACKED.flatMap(([field, action]) =>
    before[field] === after[field] ? [] : [{ action, oldValue: before[field], newValue: after[field] }],
  );
}
