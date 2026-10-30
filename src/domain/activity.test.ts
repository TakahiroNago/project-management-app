import { describe, expect, it } from "vitest";
import { diffTaskChanges, type TrackedTaskFields } from "./activity";

const base: TrackedTaskFields = {
  status: "TODO",
  assigneeId: null,
  dueDate: null,
  priority: "MEDIUM",
};

describe("diffTaskChanges", () => {
  it("変更がなければ空", () => {
    expect(diffTaskChanges(base, { ...base })).toEqual([]);
  });

  it("変わった項目ごとに 1 件ずつ、変更前後の値を記録する", () => {
    expect(
      diffTaskChanges(base, { status: "DONE", assigneeId: "u1", dueDate: "2026-11-01", priority: "HIGH" }),
    ).toEqual([
      { action: "STATUS_CHANGED", oldValue: "TODO", newValue: "DONE" },
      { action: "ASSIGNEE_CHANGED", oldValue: null, newValue: "u1" },
      { action: "DUE_DATE_CHANGED", oldValue: null, newValue: "2026-11-01" },
      { action: "PRIORITY_CHANGED", oldValue: "MEDIUM", newValue: "HIGH" },
    ]);
  });

  it("未設定への変更（担当者・期限の解除）も記録する", () => {
    const before = { ...base, assigneeId: "u1", dueDate: "2026-11-01" };
    expect(diffTaskChanges(before, base)).toEqual([
      { action: "ASSIGNEE_CHANGED", oldValue: "u1", newValue: null },
      { action: "DUE_DATE_CHANGED", oldValue: "2026-11-01", newValue: null },
    ]);
  });
});
