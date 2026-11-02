/**
 * バックアップファイルの名前と保管期間（R2 に置く暗号化済みのダンプ）。
 *
 * 削除は「新しいバックアップのアップロードに成功した後」にだけ行い、最新の 1 つは期間を過ぎても削除しない。
 * そのため、バックアップが止まった場合も、最後に取得したものは残り続ける。
 * R2 のバケットのロックで 30 日間は削除できないようにしているため、削除の対象は 31 日を過ぎたものとする
 * （ロックの期限の直前に削除しようとして失敗するのを避ける）。
 */

import type { BackupTarget } from "./target";

export const RETENTION_DAYS = 31;

const KEY_PATTERN = /^(production|preview)\/projectflow-(production|preview)-(\d{8}T\d{6}Z)\.dump\.gpg$/;

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** 例: production/projectflow-production-20261102T190012Z.dump.gpg */
export function backupObjectKey(target: BackupTarget, date: Date): string {
  return `${target}/projectflow-${target}-${compactTimestamp(date)}.dump.gpg`;
}

/** バックアップのキーから取得日時を取り出す。このワークフローが作った形式でなければ null */
export function backupKeyTimestamp(key: string): Date | null {
  const match = KEY_PATTERN.exec(key);
  if (!match || match[1] !== match[2]) return null;
  const t = match[3];
  const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type StoredObject = { key: string; lastModified: Date };

/**
 * 削除してよいバックアップを選ぶ。
 * - target のプレフィックスで、このワークフローが作った形式のキーだけを対象にする（それ以外は触らない）
 * - 取得日時（キー）とアップロード日時（LastModified）の両方が保管期間を過ぎたもの
 * - 最新のもの（キーの日時が最も新しいもの）は、期間を過ぎても残す
 */
export function selectExpiredBackups(
  objects: StoredObject[],
  { target, now, retentionDays = RETENTION_DAYS }: { target: BackupTarget; now: Date; retentionDays?: number },
): string[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const backups = objects
    .map((object) => ({ ...object, takenAt: backupKeyTimestamp(object.key) }))
    .filter((object): object is StoredObject & { takenAt: Date } => {
      return object.takenAt !== null && object.key.startsWith(`${target}/`);
    })
    .sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());

  return backups
    .slice(1)
    .filter((object) => object.takenAt.getTime() < cutoff && object.lastModified.getTime() < cutoff)
    .map((object) => object.key);
}
