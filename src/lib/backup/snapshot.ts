import { type Queryable, quoteIdent, USER_SCHEMA_CONDITION } from "./queryable";

/**
 * ダンプの検証に使う DB の要約。取得元（pg_dump と同じスナップショット）と、
 * ダンプを復元した DB の両方で集め、一致するかを比べる。
 *
 * 行数・スキーマの定義だけを持ち、データの中身は持たない。
 * 公開リポジトリのログに出すため、エラーメッセージにも行数そのものは含めない（どのテーブルが違うかだけ）。
 */
export type DbSnapshot = {
  /** "public.projects" → 行数（bigint のため文字列） */
  rowCounts: Record<string, string>;
  /** テーブル・列・インデックス・制約・トリガー・関数・型・シーケンス・ビューの識別子 */
  objects: string[];
  /** _prisma_migrations の内容（名前・チェックサム・完了・取り消し） */
  migrations: string[];
};

const MIGRATIONS_TABLE = "public._prisma_migrations";

export async function collectSnapshot(db: Queryable): Promise<DbSnapshot> {
  const { rows: tables } = await db.query<{ schema: string; name: string }>(
    `SELECT n.nspname AS schema, c.relname AS name
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND c.relkind IN ('r', 'p')
      ORDER BY 1, 2`,
  );
  const rowCounts: Record<string, string> = {};
  for (const table of tables) {
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoteIdent(table.schema)}.${quoteIdent(table.name)}`,
    );
    rowCounts[`${table.schema}.${table.name}`] = rows[0].count;
  }

  const { rows: objectRows } = await db.query<{ id: string }>(
    `SELECT 'relation:' || c.relkind::text || ':' || n.nspname || '.' || c.relname AS id
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND c.relkind IN ('r', 'p', 'i', 'I', 'S', 'v', 'm', 'f')
     UNION ALL
     SELECT 'column:' || n.nspname || '.' || c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)
            || CASE WHEN a.attnotnull THEN ' not null' ELSE '' END
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
     UNION ALL
     SELECT 'constraint:' || n.nspname || '.' || c.relname || '.' || con.conname || ':' || pg_get_constraintdef(con.oid)
       FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION}
     UNION ALL
     SELECT 'trigger:' || n.nspname || '.' || c.relname || '.' || t.tgname
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND NOT t.tgisinternal
     UNION ALL
     SELECT 'function:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE ${USER_SCHEMA_CONDITION}
     UNION ALL
     SELECT 'enum:' || n.nspname || '.' || t.typname || ':' ||
            (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
       FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND t.typtype = 'e'
     ORDER BY 1`,
  );

  let migrations: string[] = [];
  if (MIGRATIONS_TABLE in rowCounts) {
    const { rows } = await db.query<{ id: string }>(
      `SELECT migration_name || ':' || checksum || ':' ||
              CASE WHEN finished_at IS NULL THEN 'unfinished' ELSE 'finished' END || ':' ||
              CASE WHEN rolled_back_at IS NULL THEN 'active' ELSE 'rolled-back' END AS id
         FROM public._prisma_migrations ORDER BY migration_name, started_at, id`,
    );
    migrations = rows.map((row) => row.id);
  }

  return { rowCounts, objects: objectRows.map((row) => row.id), migrations };
}

/** 取得元として妥当か（空の DB や、別の DB に接続していないか） */
export function checkSourceSnapshot(source: DbSnapshot): string[] {
  const errors: string[] = [];
  if (!(MIGRATIONS_TABLE in source.rowCounts)) {
    errors.push("The source database has no _prisma_migrations table. Check BACKUP_DATABASE_URL.");
  } else if (source.migrations.length === 0) {
    errors.push("The source database has no applied migrations. Check BACKUP_DATABASE_URL.");
  }
  if (Object.keys(source.rowCounts).length < 2) {
    errors.push("The source database has no application tables. Check BACKUP_DATABASE_URL.");
  }
  return errors;
}

function difference(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((item) => !set.has(item));
}

/** 識別子の一覧から、エラーメッセージに含めてよい部分（種類と名前）だけを取り出す */
function describe(items: string[]): string {
  const shown = items.slice(0, 10).join(", ");
  return items.length > 10 ? `${shown}, ... (${items.length} in total)` : shown;
}

/**
 * 取得元とダンプを復元した DB を比べる。
 * @returns 一致しない点の一覧（空なら一致）。行数そのものは含めない
 */
export function compareSnapshots(source: DbSnapshot, restored: DbSnapshot): string[] {
  const errors: string[] = [];

  const sourceTables = Object.keys(source.rowCounts);
  const restoredTables = Object.keys(restored.rowCounts);
  const missingTables = difference(sourceTables, restoredTables);
  const extraTables = difference(restoredTables, sourceTables);
  if (missingTables.length > 0) errors.push(`Tables missing from the restored dump: ${describe(missingTables)}.`);
  if (extraTables.length > 0) errors.push(`Unexpected tables in the restored dump: ${describe(extraTables)}.`);

  const mismatched = sourceTables.filter(
    (table) => table in restored.rowCounts && restored.rowCounts[table] !== source.rowCounts[table],
  );
  if (mismatched.length > 0) errors.push(`Row counts differ from the source for: ${describe(mismatched)}.`);

  const missingObjects = difference(source.objects, restored.objects);
  const extraObjects = difference(restored.objects, source.objects);
  if (missingObjects.length > 0) errors.push(`Schema objects missing from the restored dump: ${describe(missingObjects)}.`);
  if (extraObjects.length > 0) errors.push(`Unexpected schema objects in the restored dump: ${describe(extraObjects)}.`);

  if (source.migrations.join("\n") !== restored.migrations.join("\n")) {
    errors.push("The migration history (_prisma_migrations) differs from the source.");
  }
  return errors;
}
