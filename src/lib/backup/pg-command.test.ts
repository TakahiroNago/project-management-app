import { describe, expect, it } from "vitest";
import {
  describePgResult,
  MAX_STDERR_BYTES,
  type PgCommandResult,
  runPgCommand,
  runPgCommandSafely,
  summarizePgStderr,
} from "./pg-command";

/**
 * PostgreSQL 18 の pg_restore が実際に出したエラー（ネットワークを切った Docker のコンテナで、ダミーのデータを使って再現したもの）
 */
const UNIQUE_VIOLATION = [
  'pg_restore: error: COPY failed for table "users": ERROR:  duplicate key value violates unique constraint "users_pkey"',
  "DETAIL:  Key (email)=(dummy@example.test) already exists.",
  "CONTEXT:  COPY users, line 1",
].join("\n");
const INVALID_INPUT = [
  'pg_restore: error: COPY failed for table "users": ERROR:  invalid input syntax for type integer: "dummy@example.test"',
  'CONTEXT:  COPY users, line 1, column email: "dummy@example.test"',
].join("\n");

/** ログに出てはいけない値 */
const SECRETS = ["dummy@example.test", "Key (email)", "COPY users, line 1", "users_pkey", "DETAIL", "CONTEXT"];

function expectNoSecrets(messages: string[]) {
  const text = messages.join("\n");
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

/** 標準エラーに text を書いて exitCode で終了する子プロセス（pg_restore の代わり） */
function fakePgRestore(text: string, exitCode: number): [string, string[]] {
  const script = `process.stderr.write(${JSON.stringify(text)} + "\\n"); process.exit(${exitCode});`;
  return [process.execPath, ["-e", script]];
}

const failed = (stderr: string): PgCommandResult => ({ exitCode: 1, signal: null, stderr, stderrTruncated: false });

describe("runPgCommandSafely（実際の子プロセス）", () => {
  it("復元に失敗したとき、標準エラーの DETAIL・CONTEXT・行のデータをメッセージに含めない", async () => {
    const [command, args] = fakePgRestore(UNIQUE_VIOLATION, 1);
    const { ok, messages } = await runPgCommandSafely(command, args, process.env, { knownTables: ["users", "projects"] });

    expect(ok).toBe(false);
    expectNoSecrets(messages);
    const text = messages.join("\n");
    expect(text).toContain("failed (exit code 1).");
    expect(text).toContain("1 error line(s)");
    expect(text).toContain("2 other line(s)");
    expect(text).toContain("unique_violation");
    expect(text).toContain("copy_failed");
    expect(text).toContain("tables: users");
  });

  it("エラーの 1 行目に値が含まれる場合（型の不一致）も、値を出さない", async () => {
    const [command, args] = fakePgRestore(INVALID_INPUT, 1);
    const { ok, messages } = await runPgCommandSafely(command, args, process.env, { knownTables: ["users"] });

    expect(ok).toBe(false);
    expectNoSecrets(messages);
    expect(messages.join("\n")).toContain("invalid_input");
  });

  it("成功して標準エラーが空なら、メッセージは無い", async () => {
    const { ok, messages } = await runPgCommandSafely(process.execPath, ["-e", "process.exit(0)"], process.env);
    expect(ok).toBe(true);
    expect(messages).toEqual([]);
  });

  it("成功しても標準エラーがあれば（警告など）、中身は出さずに要約だけを返す", async () => {
    const [command, args] = fakePgRestore('pg_dump: warning: something about "dummy@example.test"', 0);
    const { ok, messages } = await runPgCommandSafely(command, args, process.env);
    expect(ok).toBe(true);
    expectNoSecrets(messages);
    expect(messages).toEqual([expect.stringContaining("1 warning line(s)")]);
  });

  it("標準出力も、ログに流さない", async () => {
    const result = await runPgCommand(process.execPath, ["-e", 'process.stdout.write("dummy@example.test")'], process.env);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
  });

  it("起動に失敗した場合は、失敗として返す", async () => {
    const { ok, messages } = await runPgCommandSafely("projectflow-command-that-does-not-exist", [], process.env);
    expect(ok).toBe(false);
    expect(messages).toEqual(["Could not start projectflow-command-that-does-not-exist (ENOENT)."]);
  });

  it("標準エラーが上限を超えたら切り詰め、そのことだけを出す", async () => {
    const script = `process.stderr.write("x".repeat(${MAX_STDERR_BYTES + 10})); process.exit(1);`;
    const result = await runPgCommand(process.execPath, ["-e", script], process.env);
    expect(result.stderrTruncated).toBe(true);
    expect(Buffer.byteLength(result.stderr)).toBe(MAX_STDERR_BYTES);
    expect(describePgResult("pg_restore", result).join("\n")).toContain("output truncated");
  });
});

describe("summarizePgStderr", () => {
  it("取得元に無い名前は、テーブル名として出さない（データに同じ形の文字列があっても）", () => {
    const stderr = 'pg_restore: error: COPY failed for table "dummy@example.test": ERROR:  something';
    const summary = summarizePgStderr(stderr, { knownTables: ["users"] });
    expect(summary.tables).toEqual([]);
    expect(summary.categories).toEqual(["copy_failed"]);
  });

  it("knownTables を渡さなければ、テーブル名は出さない", () => {
    expect(summarizePgStderr(UNIQUE_VIOLATION).tables).toEqual([]);
  });

  it("接続の失敗を分類する", () => {
    const stderr =
      'pg_dump: error: connection to server at "host.example.test" (192.0.2.1), port 5432 failed: FATAL:  password authentication failed for user "dummy"';
    const summary = summarizePgStderr(stderr);
    expect(summary.categories).toEqual(["authentication_failed", "connection_failed"]);
    expect(summary.errorLines).toBe(1);
  });

  it("分類できない行も数えるだけで、中身は出さない", () => {
    const messages = describePgResult("pg_restore", failed("something unexpected: dummy@example.test"));
    expectNoSecrets(messages);
    expect(messages.join("\n")).toContain("1 other line(s)");
    expect(messages.join("\n")).not.toContain("categories");
  });

  it("シグナルで終了した場合はシグナル名を出す", () => {
    const messages = describePgResult("pg_dump", { exitCode: null, signal: "SIGKILL", stderr: "", stderrTruncated: false });
    expect(messages).toEqual(["pg_dump failed (exit code SIGKILL)."]);
  });
});
