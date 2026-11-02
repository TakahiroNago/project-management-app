import { type Queryable, USER_SCHEMA_CONDITION } from "./queryable";

/** バックアップ用ロールが所属してよいロール（PostgreSQL 14 以降の読み取り専用の定義済みロール） */
const ALLOWED_MEMBERSHIPS = new Set(["pg_read_all_data"]);

type RoleRow = {
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
};

/**
 * 接続中のロールが「読み取り専用」で、ダンプに必要な権限を持っているかを検査する。
 * 接続情報は公開リポジトリの GitHub Actions に置くため、漏れても書き込み・削除ができないことを確認する。
 *
 * - SUPERUSER・CREATEROLE・CREATEDB・REPLICATION・BYPASSRLS を持たない
 * - pg_read_all_data 以外のロールに所属しない（所属先の権限を引き継ぐため。neon_superuser・neondb_owner など）
 * - オブジェクトの所有者ではない（所有者は権限に関係なく変更・削除できる）
 * - DB・スキーマに CREATE 権限がない
 * - すべてのテーブルに SELECT があり、それ以外のテーブルの権限（INSERT・UPDATE・DELETE・TRUNCATE・REFERENCES・TRIGGER）がない
 * - すべてのシーケンスに SELECT があり、USAGE・UPDATE がない（nextval / setval で値を変えられるため）
 *
 * @returns 問題点の一覧（空なら問題なし）。テーブル名などのスキーマの情報だけを含め、データは含めない
 */
export async function checkReadOnlyRole(db: Queryable): Promise<string[]> {
  const errors: string[] = [];

  const { rows: roles } = await db.query<RoleRow>(
    `SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
  );
  const role = roles[0];
  if (!role) return ["Could not read the attributes of the current role."];
  const attributes = (
    [
      ["SUPERUSER", role.rolsuper],
      ["CREATEROLE", role.rolcreaterole],
      ["CREATEDB", role.rolcreatedb],
      ["REPLICATION", role.rolreplication],
      ["BYPASSRLS", role.rolbypassrls],
    ] as const
  )
    .filter(([, value]) => value)
    .map(([name]) => name);
  if (attributes.length > 0) {
    errors.push(`The backup role must not have these attributes: ${attributes.join(", ")}.`);
  }

  // 直接の所属だけでなく、所属先がさらに所属しているロールもたどる
  const { rows: memberships } = await db.query<{ rolname: string }>(
    `WITH RECURSIVE granted(oid) AS (
       SELECT m.roleid FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = current_user
       UNION
       SELECT m.roleid FROM pg_auth_members m JOIN granted g ON g.oid = m.member
     )
     SELECT r.rolname FROM granted g JOIN pg_roles r ON r.oid = g.oid ORDER BY r.rolname`,
  );
  const extraRoles = memberships.map((m) => m.rolname).filter((name) => !ALLOWED_MEMBERSHIPS.has(name));
  if (extraRoles.length > 0) {
    errors.push(`The backup role must not be a member of these roles: ${extraRoles.join(", ")}.`);
  }

  const { rows: owned } = await db.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) +
       (SELECT count(*) FROM pg_namespace WHERE nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) +
       (SELECT count(*) FROM pg_proc WHERE proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) +
       (SELECT count(*) FROM pg_type WHERE typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) +
       (SELECT count(*) FROM pg_database WHERE datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user))
     )::text AS count`,
  );
  if (owned[0]?.count !== "0") {
    errors.push("The backup role must not own any database objects.");
  }

  const { rows: dbCreate } = await db.query<{ allowed: boolean }>(
    `SELECT has_database_privilege(current_database(), 'CREATE') AS allowed`,
  );
  if (dbCreate[0]?.allowed) {
    errors.push("The backup role must not have the CREATE privilege on the database.");
  }

  const { rows: schemas } = await db.query<{ nspname: string }>(
    `SELECT n.nspname FROM pg_namespace n
      WHERE ${USER_SCHEMA_CONDITION} AND has_schema_privilege(n.oid, 'CREATE')
      ORDER BY n.nspname`,
  );
  if (schemas.length > 0) {
    errors.push(`The backup role must not have the CREATE privilege on these schemas: ${schemas.map((s) => s.nspname).join(", ")}.`);
  }

  const { rows: tables } = await db.query<{ name: string; can_select: boolean; can_write: boolean }>(
    `SELECT n.nspname || '.' || c.relname AS name,
            has_table_privilege(c.oid, 'SELECT') AS can_select,
            has_table_privilege(c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS can_write
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      ORDER BY 1`,
  );
  const unreadable = tables.filter((t) => !t.can_select).map((t) => t.name);
  const writable = tables.filter((t) => t.can_write).map((t) => t.name);
  if (unreadable.length > 0) {
    errors.push(`The backup role cannot SELECT these tables (grant SELECT so they are included in the dump): ${unreadable.join(", ")}.`);
  }
  if (writable.length > 0) {
    errors.push(`The backup role must not be able to modify these tables: ${writable.join(", ")}.`);
  }

  const { rows: sequences } = await db.query<{ name: string; can_select: boolean; can_write: boolean }>(
    `SELECT n.nspname || '.' || c.relname AS name,
            has_sequence_privilege(c.oid, 'SELECT') AS can_select,
            has_sequence_privilege(c.oid, 'USAGE, UPDATE') AS can_write
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_SCHEMA_CONDITION} AND c.relkind = 'S'
      ORDER BY 1`,
  );
  const unreadableSequences = sequences.filter((s) => !s.can_select).map((s) => s.name);
  const writableSequences = sequences.filter((s) => s.can_write).map((s) => s.name);
  if (unreadableSequences.length > 0) {
    errors.push(`The backup role cannot SELECT these sequences: ${unreadableSequences.join(", ")}.`);
  }
  if (writableSequences.length > 0) {
    errors.push(`The backup role must not be able to change these sequences: ${writableSequences.join(", ")}.`);
  }

  return errors;
}
