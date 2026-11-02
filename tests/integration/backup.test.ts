import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { checkReadOnlyRole } from "@/lib/backup/read-only-role";
import { collectSnapshot, compareSnapshots } from "@/lib/backup/snapshot";
import { createUser } from "../helpers/factories";

/**
 * バックアップ用ロールの検査とスナップショットの収集を、実際の PostgreSQL（テスト用 DB）で確認する。
 * ロールはクラスター全体で共有されるため、テスト専用の名前にし、終了時に削除する。
 */
const ADMIN_URL = process.env.DATABASE_URL!;
const READER = "projectflow_backup_test_reader";
const WRITER = "projectflow_backup_test_writer";
const PASSWORD = "backup-test-password";

function urlFor(user: string): string {
  const url = new URL(ADMIN_URL);
  url.username = user;
  url.password = PASSWORD;
  return url.toString();
}

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const admin = new pg.Client({ connectionString: ADMIN_URL });

async function dropTestRoles() {
  for (const role of [READER, WRITER]) {
    const { rows } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (rows.length > 0) {
      await admin.query(`DROP OWNED BY ${role}`);
      await admin.query(`DROP ROLE ${role}`);
    }
  }
}

/** docs/deployment.md の手順と同じ権限のロール */
async function createReader() {
  await admin.query(`CREATE ROLE ${READER} LOGIN PASSWORD '${PASSWORD}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${READER}`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READER}`);
  await admin.query(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ${READER}`);
}

beforeAll(async () => {
  await admin.connect();
  await dropTestRoles();
});

afterEach(async () => {
  await dropTestRoles();
});

afterAll(async () => {
  await admin.end();
});

describe("checkReadOnlyRole", () => {
  it("手順どおりの読み取り専用ロールは問題なし", async () => {
    await createReader();
    expect(await withClient(urlFor(READER), checkReadOnlyRole)).toEqual([]);
  });

  it("pg_read_all_data を付けたロールも問題なし", async () => {
    await admin.query(`CREATE ROLE ${READER} LOGIN PASSWORD '${PASSWORD}' IN ROLE pg_read_all_data`);
    expect(await withClient(urlFor(READER), checkReadOnlyRole)).toEqual([]);
  });

  it("スーパーユーザー・テーブルの所有者（マイグレーション用のロール）は拒否する", async () => {
    const errors = (await withClient(ADMIN_URL, checkReadOnlyRole)).join("\n");
    expect(errors).toContain("SUPERUSER");
    expect(errors).toContain("must not own any database objects");
  });

  it("テーブルを変更できる権限があれば拒否する", async () => {
    await createReader();
    await admin.query(`GRANT INSERT ON public.comments TO ${READER}`);
    await admin.query(`GRANT TRUNCATE ON public.tasks TO ${READER}`);
    const errors = await withClient(urlFor(READER), checkReadOnlyRole);
    expect(errors).toEqual(["The backup role must not be able to modify these tables: public.comments, public.tasks."]);
  });

  it("SELECT できないテーブルがあれば拒否する（ダンプから漏れるため）", async () => {
    await createReader();
    await admin.query(`REVOKE SELECT ON public.users FROM ${READER}`);
    const errors = await withClient(urlFor(READER), checkReadOnlyRole);
    expect(errors.join()).toContain("cannot SELECT these tables");
    expect(errors.join()).toContain("public.users");
  });

  it("書き込みできるロールに所属していれば拒否する（間接的な所属も含む）", async () => {
    await createReader();
    await admin.query(`CREATE ROLE ${WRITER} NOLOGIN IN ROLE pg_write_all_data`);
    await admin.query(`GRANT ${WRITER} TO ${READER}`);
    const errors = (await withClient(urlFor(READER), checkReadOnlyRole)).join("\n");
    expect(errors).toContain(`must not be a member of these roles: pg_write_all_data, ${WRITER}`);
    expect(errors).toContain("must not be able to modify these tables");
  });

  it("スキーマ・DB に CREATE 権限があれば拒否する", async () => {
    await createReader();
    await admin.query(`GRANT CREATE ON SCHEMA public TO ${READER}`);
    const { rows } = await admin.query<{ db: string }>("SELECT current_database() AS db");
    await admin.query(`GRANT CREATE ON DATABASE ${rows[0].db} TO ${READER}`);
    const errors = (await withClient(urlFor(READER), checkReadOnlyRole)).join("\n");
    expect(errors).toContain("CREATE privilege on the database");
    expect(errors).toContain("CREATE privilege on these schemas: public");
  });

  it("CREATEROLE などの属性があれば拒否する", async () => {
    await createReader();
    await admin.query(`ALTER ROLE ${READER} CREATEROLE CREATEDB`);
    expect((await withClient(urlFor(READER), checkReadOnlyRole)).join()).toContain("CREATEROLE, CREATEDB");
  });
});

describe("collectSnapshot", () => {
  it("行数・スキーマのオブジェクト・マイグレーションの履歴を集める", async () => {
    await createUser();
    await createUser();
    const snapshot = await withClient(ADMIN_URL, collectSnapshot);

    expect(snapshot.rowCounts["public.users"]).toBe("2");
    expect(snapshot.rowCounts["public.projects"]).toBe("0");
    expect(Object.keys(snapshot.rowCounts)).toHaveLength(11);
    expect(snapshot.objects).toContain("enum:public.ProjectRole:OWNER,MEMBER");
    expect(snapshot.objects.some((o) => o.startsWith("trigger:public.project_members."))).toBe(true);
    expect(snapshot.objects.some((o) => o.startsWith("function:public.assert_project_has_single_owner("))).toBe(true);
    expect(snapshot.migrations.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.migrations.every((m) => m.endsWith(":finished:active"))).toBe(true);
  });

  it("同じ DB なら一致し、行が増えると違いを検出する", async () => {
    await createUser();
    const before = await withClient(ADMIN_URL, collectSnapshot);
    expect(compareSnapshots(before, await withClient(ADMIN_URL, collectSnapshot))).toEqual([]);

    // ユーザーの登録ではアカウント・セッションも作られる
    await createUser();
    const errors = compareSnapshots(before, await withClient(ADMIN_URL, collectSnapshot));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row counts differ from the source for: .*public\.users/);
  });

  it("読み取り専用ロールでも同じ結果を集められる", async () => {
    await createUser();
    await createReader();
    const asAdmin = await withClient(ADMIN_URL, collectSnapshot);
    const asReader = await withClient(urlFor(READER), collectSnapshot);
    expect(compareSnapshots(asAdmin, asReader)).toEqual([]);
  });
});
