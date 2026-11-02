/** pg の Client / PoolClient と互換の最小限のインターフェイス（テストで差し替えられるようにする） */
export type Queryable = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

/** pg_catalog・information_schema・pg_toast などを除いた、ユーザーのスキーマを選ぶ条件（n = pg_namespace） */
export const USER_SCHEMA_CONDITION = `n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'`;

/** SQL の識別子として引用する（"projects"） */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
