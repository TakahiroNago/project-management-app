/**
 * カンバンの並び順（純粋関数）。
 * 各列（ステータス）内のタスクの position は 0 始まりの連番に保つ。
 */
export const TASK_COLUMNS = ["TODO", "IN_PROGRESS", "DONE"] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

/** 列ごとのタスク ID の並び */
export type ColumnOrder = Record<TaskColumn, string[]>;

export type PositionedTask = { id: string; status: TaskColumn; position: number };

export function emptyColumns(): ColumnOrder {
  return { TODO: [], IN_PROGRESS: [], DONE: [] };
}

/** タスクを列ごとに position 順（同順位は入力順）で並べる */
export function groupIntoColumns(tasks: readonly PositionedTask[]): ColumnOrder {
  const columns = emptyColumns();
  const sorted = tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => a.task.position - b.task.position || a.index - b.index);
  for (const { task } of sorted) columns[task.status].push(task.id);
  return columns;
}

/** タスクが属する列を返す（見つからなければ null） */
export function findColumn(columns: ColumnOrder, taskId: string): TaskColumn | null {
  return TASK_COLUMNS.find((column) => columns[column].includes(taskId)) ?? null;
}

/**
 * タスクを toColumn の toIndex 番目に移動した新しい並びを返す（元の値は変更しない）。
 * toIndex は範囲外なら端に丸める（Infinity で末尾）。
 */
export function moveTaskInColumns(
  columns: ColumnOrder,
  taskId: string,
  toColumn: TaskColumn,
  toIndex: number,
): ColumnOrder {
  const fromColumn = findColumn(columns, taskId);
  if (!fromColumn) throw new Error(`Task ${taskId} is not in any column`);

  const next: ColumnOrder = {
    TODO: [...columns.TODO],
    IN_PROGRESS: [...columns.IN_PROGRESS],
    DONE: [...columns.DONE],
  };
  next[fromColumn] = next[fromColumn].filter((id) => id !== taskId);

  const target = next[toColumn];
  const index = Number.isFinite(toIndex)
    ? Math.min(Math.max(Math.trunc(toIndex), 0), target.length)
    : toIndex > 0
      ? target.length
      : 0;
  target.splice(index, 0, taskId);
  return next;
}

/** 列の並びと現在の値を比べ、status / position が変わるタスクだけを返す */
export function diffPositions(
  current: readonly PositionedTask[],
  columns: ColumnOrder,
): PositionedTask[] {
  const byId = new Map(current.map((task) => [task.id, task]));
  const changes: PositionedTask[] = [];
  for (const status of TASK_COLUMNS) {
    columns[status].forEach((id, position) => {
      const before = byId.get(id);
      if (!before || before.status !== status || before.position !== position) {
        changes.push({ id, status, position });
      }
    });
  }
  return changes;
}
