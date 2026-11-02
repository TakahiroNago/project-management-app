/**
 * 論理バックアップを取得し、復元できることを確認する（.github/workflows/backup.yml から実行）。
 *
 *   npx tsx scripts/backup/dump-and-verify.ts
 *
 * 1. 接続先と、バックアップ用ロールが読み取り専用であることを検査する
 * 2. 取得元でスナップショットを作り（REPEATABLE READ）、同じスナップショットで pg_dump を実行する
 * 3. ダンプを空の DB（ローカルのサービスコンテナ）に pg_restore し、取得元と行数・スキーマ・マイグレーションの履歴を比べる
 *
 * 環境変数:
 *   BACKUP_TARGET              production | preview | local（local はローカルでの動作確認用。localhost の DB のみ）
 *   BACKUP_DATABASE_URL        取得元（Neon の Direct Connection、読み取り専用ロール）
 *   PRODUCTION_DB_ENDPOINT_ID  本番ブランチのエンドポイント ID（local 以外）
 *   RESTORE_DATABASE_URL       復元の確認に使う空の DB（localhost のみ）
 *   BACKUP_FILE                ダンプの出力先（平文。呼び出し側で暗号化してから削除する）
 *
 * 接続文字列は pg_dump / pg_restore の引数ではなく環境変数（PGHOST など）で渡す。
 * ログには件数・テーブル名などのスキーマの情報だけを出し、行数やデータは出さない。
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import pg from "pg";
import { isLocalDatabaseUrl } from "../../src/lib/database-url";
import { libpqEnv } from "../../src/lib/backup/libpq-env";
import { checkReadOnlyRole } from "../../src/lib/backup/read-only-role";
import { checkSourceSnapshot, collectSnapshot, compareSnapshots } from "../../src/lib/backup/snapshot";
import { checkBackupTarget } from "../../src/lib/backup/target";

class StepError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
  }
}

function fail(...errors: string[]): never {
  throw new StepError(errors);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`${name} is not set.`);
  return value;
}

/** pg_dump / pg_restore を実行する。標準出力・標準エラーはそのまま流す（ホスト名は呼び出し側で伏せ字にしている） */
function run(command: string, args: string[], connectionUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...libpqEnv(connectionUrl), BACKUP_DATABASE_URL: "", RESTORE_DATABASE_URL: "" },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", (e) => reject(new StepError([`Could not start ${command} (${e.message}).`])));
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new StepError([`${command} failed (exit code ${code ?? signal}).`]));
    });
  });
}

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30_000 });
  try {
    await client.connect();
  } catch (e) {
    fail(`Could not connect to the database (${e instanceof Error ? e.message : "unknown error"}).`);
  }
  return client;
}

async function main() {
  const target = requireEnv("BACKUP_TARGET");
  const sourceUrl = requireEnv("BACKUP_DATABASE_URL");
  const restoreUrl = requireEnv("RESTORE_DATABASE_URL");
  const file = requireEnv("BACKUP_FILE");

  if (target === "local") {
    if (!isLocalDatabaseUrl(sourceUrl)) fail("BACKUP_TARGET=local can only back up a local database.");
  } else {
    const errors = checkBackupTarget(target, process.env);
    if (errors.length > 0) fail(...errors);
  }
  if (!isLocalDatabaseUrl(restoreUrl)) fail("RESTORE_DATABASE_URL must be a local database (it is used for a test restore).");
  if (existsSync(file)) fail("BACKUP_FILE already exists. Refusing to overwrite it.");

  // 1. 読み取り専用ロールの検査
  const source = await connect(sourceUrl);
  try {
    const roleErrors = await checkReadOnlyRole(source);
    if (roleErrors.length > 0) fail(...roleErrors);
    console.info("Backup role check passed (read-only).");

    // 2. スナップショットを作り、同じスナップショットでダンプと集計を行う
    await source.query("SET idle_in_transaction_session_timeout = 0");
    await source.query("SET statement_timeout = '10min'");
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const { rows } = await source.query<{ snapshot: string }>("SELECT pg_export_snapshot() AS snapshot");
    const snapshot = rows[0].snapshot;

    await run(
      "pg_dump",
      ["--format=custom", `--snapshot=${snapshot}`, "--lock-wait-timeout=60s", "--no-password", `--file=${file}`],
      sourceUrl,
    );
    console.info(`Dump created (${statSync(file).size} bytes).`);

    const sourceSnapshot = await collectSnapshot(source);
    await source.query("COMMIT");
    const sourceErrors = checkSourceSnapshot(sourceSnapshot);
    if (sourceErrors.length > 0) fail(...sourceErrors);

    // 3. 空の DB に復元して比べる
    const restore = await connect(restoreUrl);
    try {
      const restoredBefore = await collectSnapshot(restore);
      if (Object.keys(restoredBefore.rowCounts).length > 0 || restoredBefore.objects.length > 0) {
        fail("RESTORE_DATABASE_URL is not empty. Use a new, empty database for the test restore.");
      }
      // 所有者・権限は復元先に同じロールが無いため復元しない（実際の復旧では付けたまま復元する。deployment.md 8.3）
      await run(
        "pg_restore",
        ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--no-password", `--dbname=${libpqEnv(restoreUrl).PGDATABASE}`, file],
        restoreUrl,
      );
      const restoredSnapshot = await collectSnapshot(restore);
      const diff = compareSnapshots(sourceSnapshot, restoredSnapshot);
      if (diff.length > 0) fail(...diff);
    } finally {
      await restore.end();
    }

    console.info(
      `Test restore passed: ${Object.keys(sourceSnapshot.rowCounts).length} tables, ` +
        `${sourceSnapshot.objects.length} schema objects and ${sourceSnapshot.migrations.length} migrations match the source.`,
    );
  } finally {
    await source.end().catch(() => undefined);
  }
}

main().catch((e: unknown) => {
  const errors = e instanceof StepError ? e.errors : [`Unexpected error: ${e instanceof Error ? e.message : "unknown error"}`];
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
});
