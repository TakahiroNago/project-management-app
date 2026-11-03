import { spawn } from "node:child_process";

/**
 * pg_dump / pg_restore を実行し、その標準エラーを GitHub Actions のログに直接出さずに要約する
 * （scripts/backup/dump-and-verify.ts から使う）。
 *
 * PostgreSQL のエラーには行のデータが含まれることがある。例（PostgreSQL 18 の pg_restore の実際の出力）:
 *   pg_restore: error: COPY failed for table "users": ERROR:  invalid input syntax for type integer: "<値>"
 *   DETAIL:  Key (email)=(<値>) already exists.
 *   CONTEXT:  COPY users, line 1, column email: "<値>"
 * 公開リポジトリのログは誰でも閲覧できるため、出力は行単位でも表示しない。
 * 代わりに、終了コード・行数・あらかじめ決めた分類名・（取得元に実在する）テーブル名だけを出す。
 *
 * 標準エラーはメモリ上に（上限まで）保持するだけで、ファイルには書かない（消し忘れが起きない）。
 */

/** 保持する標準エラーの上限。超えた分は捨てる（要約には「切り詰めた」とだけ出す） */
export const MAX_STDERR_BYTES = 1024 * 1024;

export type PgCommandResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stderrTruncated: boolean;
};

/**
 * コマンドを実行して、終了コードと標準エラーを返す。標準出力は使わない（--file / --dbname で出力先を指定する）ため捨てる。
 * 起動に失敗した場合（コマンドが無いなど）は reject する。そのメッセージにはデータを含まない。
 */
export function runPgCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<PgCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderrTruncated = false;
    child.stderr.on("data", (chunk: Buffer) => {
      const room = MAX_STDERR_BYTES - size;
      if (room <= 0) {
        stderrTruncated = true;
        return;
      }
      // 上限を超える分は保持しない。subarray は元のチャンク全体を参照し続けるため、収まる部分だけをコピーする
      // （上限に達した後も読み続けて捨てる。読まないと、子プロセスがパイプへの書き込みで止まるため）
      let kept = chunk;
      if (chunk.length > room) {
        stderrTruncated = true;
        kept = Buffer.from(chunk.subarray(0, room));
      }
      chunks.push(kept);
      size += kept.length;
    });
    // "close" は、子プロセスの終了後に標準エラーを最後まで読み終えてから発生する（"exit" は読み終える前に発生しうる）
    child.on("error", (e: NodeJS.ErrnoException) => reject(new Error(`Could not start ${command} (${e.code ?? "unknown error"}).`)));
    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, signal, stderr: Buffer.concat(chunks).toString("utf8"), stderrTruncated });
    });
  });
}

/**
 * エラーの分類。行のどこかに一致すれば、その分類名（固定の文字列）だけを出す。
 * 一致した行の内容そのものは出さない。
 */
const CATEGORIES: [name: string, pattern: RegExp][] = [
  ["unique_violation", /duplicate key value violates unique constraint|could not create unique index/i],
  ["foreign_key_violation", /violates foreign key constraint/i],
  ["not_null_violation", /violates not-null constraint|null value in column/i],
  ["check_violation", /violates check constraint/i],
  ["invalid_input", /invalid input (syntax|value)|out of range|value too long|invalid byte sequence/i],
  ["missing_object", /does not exist/i],
  ["already_exists", /already exists/i],
  ["permission_denied", /permission denied|must be owner/i],
  ["authentication_failed", /authentication failed|no password supplied/i],
  ["connection_failed", /could not connect|connection to server|could not translate host name|server closed the connection|connection refused|timeout expired/i],
  ["ssl_error", /\bssl\b|certificate/i],
  ["version_mismatch", /version mismatch|unsupported version|server version/i],
  ["lock_timeout", /lock timeout|could not obtain lock/i],
  ["statement_timeout", /statement timeout|canceling statement/i],
  ["snapshot_error", /snapshot/i],
  ["disk_full", /no space left on device|could not extend file/i],
  ["out_of_memory", /out of memory/i],
  ["invalid_archive", /does not appear to be a valid archive|could not read input file|unexpected end of file|corrupt/i],
  ["copy_failed", /COPY failed for table/i],
];

/** pg_restore の「COPY failed for table "<名前>"」から名前を取り出す。取得元に実在するテーブル名と一致したときだけ使う */
const COPY_FAILED_TABLE = /^pg_restore: error: COPY failed for table "([^"]+)"/;
const TOOL_LINE = /^(pg_dump|pg_restore): (error|warning): /;

export type PgStderrSummary = {
  errorLines: number;
  warningLines: number;
  /** DETAIL・CONTEXT・Command was など、それ以外の行（すべて表示しない） */
  otherLines: number;
  categories: string[];
  tables: string[];
  truncated: boolean;
};

/**
 * 標準エラーを要約する。
 * @param knownTables 取得元に実在するテーブル名（スキーマなし）。COPY に失敗したテーブル名は、この中にあるものだけを出す
 *   （データの中に同じ形の文字列があっても、テーブル名として出さないため）
 */
export function summarizePgStderr(stderr: string, { knownTables = [], truncated = false }: { knownTables?: Iterable<string>; truncated?: boolean } = {}): PgStderrSummary {
  const known = new Set(knownTables);
  const categories = new Set<string>();
  const tables = new Set<string>();
  let errorLines = 0;
  let warningLines = 0;
  let otherLines = 0;

  for (const line of stderr.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const tool = TOOL_LINE.exec(line);
    if (tool?.[2] === "error") errorLines++;
    else if (tool?.[2] === "warning") warningLines++;
    else otherLines++;

    for (const [name, pattern] of CATEGORIES) {
      if (pattern.test(line)) categories.add(name);
    }
    const table = COPY_FAILED_TABLE.exec(line)?.[1];
    if (table !== undefined && known.has(table)) tables.add(table);
  }

  return {
    errorLines,
    warningLines,
    otherLines,
    categories: CATEGORIES.map(([name]) => name).filter((name) => categories.has(name)),
    tables: [...tables].sort(),
    truncated,
  };
}

/** 要約を 1 行の文にする（ログに出してよい情報だけ） */
export function formatPgStderrSummary(command: string, summary: PgStderrSummary): string {
  const parts = [
    `${summary.errorLines} error line(s)`,
    `${summary.warningLines} warning line(s)`,
    `${summary.otherLines} other line(s)`,
  ];
  if (summary.categories.length > 0) parts.push(`categories: ${summary.categories.join(", ")}`);
  if (summary.tables.length > 0) parts.push(`tables: ${summary.tables.join(", ")}`);
  if (summary.truncated) parts.push("output truncated");
  return `${command} output withheld because it can contain row data (${parts.join("; ")}).`;
}

/**
 * 失敗したときにログに出すメッセージ（終了コードと要約）。成功時に標準エラーがあった場合（警告など）も、要約だけを返す。
 * @returns 出力するメッセージ。標準エラーが空で成功した場合は空
 */
export function describePgResult(command: string, result: PgCommandResult, knownTables: Iterable<string> = []): string[] {
  const summary = summarizePgStderr(result.stderr, { knownTables, truncated: result.stderrTruncated });
  const hasOutput = summary.errorLines + summary.warningLines + summary.otherLines > 0;
  const messages: string[] = [];
  if (result.exitCode !== 0) {
    messages.push(`${command} failed (exit code ${result.exitCode ?? result.signal ?? "unknown"}).`);
  }
  if (hasOutput) messages.push(formatPgStderrSummary(command, summary));
  return messages;
}

/**
 * runPgCommand と describePgResult をまとめたもの。起動の失敗も、失敗として（データを含まないメッセージで）返す。
 * @returns ok: 終了コードが 0 か。messages: ログに出してよいメッセージ
 */
export async function runPgCommandSafely(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  { knownTables = [] }: { knownTables?: Iterable<string> } = {},
): Promise<{ ok: boolean; messages: string[] }> {
  let result: PgCommandResult;
  try {
    result = await runPgCommand(command, args, env);
  } catch (e) {
    return { ok: false, messages: [e instanceof Error ? e.message : `Could not start ${command}.`] };
  }
  return { ok: result.exitCode === 0, messages: describePgResult(command, result, knownTables) };
}
