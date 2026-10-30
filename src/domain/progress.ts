/**
 * 進捗率（%）= 完了タスク数 ÷ 全タスク数。
 * タスクが 0 件の場合は 0%。小数点以下は切り捨て（100% は全タスク完了時のみ表示するため）。
 */
export function calculateProgress(doneCount: number, totalCount: number): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 0;
  const done = Math.min(Math.max(doneCount, 0), totalCount);
  return Math.floor((done / totalCount) * 100);
}
