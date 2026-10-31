import { isLocalDatabaseUrl, isNeonPooledUrl } from "../src/lib/database-url";

type Env = Record<string, string | undefined>;

/**
 * ローカルの DB に対してだけ実行を許すコマンド。開発用のコマンドで、DB のリセット
 * （全データの削除）を伴うことがある（migrate dev はスキーマのずれを検出するとリセットを求める）。
 */
const LOCAL_ONLY_COMMANDS = [
  ["migrate", "dev"],
  ["migrate", "reset"],
  ["db", "push"],
] as const;

/** 実行中の Prisma CLI のコマンド（process.argv）が LOCAL_ONLY_COMMANDS に当たるか */
export function localOnlyCommand(argv: readonly string[]): string | null {
  for (const [command, subcommand] of LOCAL_ONLY_COMMANDS) {
    const index = argv.indexOf(command);
    if (index !== -1 && argv[index + 1] === subcommand) return `${command} ${subcommand}`;
  }
  return null;
}

/**
 * Prisma CLI（migrate / db seed / studio など）が接続する URL を決める。
 *
 * - DIRECT_URL があればそれを使う（本番・Preview のマイグレーションは必ずこちら）。
 *   Pooled Connection（PgBouncer 経由）が設定されていたら、誤設定として例外にする。
 * - DIRECT_URL が無い場合は、DATABASE_URL がローカル（Docker）のときだけそれを使う。
 *   リモートの DATABASE_URL（Vercel の Pooled Connection など）では undefined を返し、
 *   マイグレーション系のコマンドを接続先なしで失敗させる。
 * - 接続先がローカル以外のとき、migrate dev / migrate reset / db push は例外にする。
 *
 * prisma generate は接続先を必要としないため、undefined でも成功する（Vercel のビルド）。
 */
export function resolveMigrationUrl(env: Env, argv: readonly string[] = []): string | undefined {
  const url = resolveUrl(env);
  const command = localOnlyCommand(argv);
  if (url && command && !isLocalDatabaseUrl(url)) {
    throw new Error(
      `"prisma ${command}" is allowed only for a local database. Use "prisma migrate deploy" (GitHub Actions) for remote databases.`,
    );
  }
  return url;
}

function resolveUrl(env: Env): string | undefined {
  const directUrl = env.DIRECT_URL;
  if (directUrl) {
    if (isNeonPooledUrl(directUrl)) {
      throw new Error(
        "DIRECT_URL is a Neon pooled connection (-pooler). Use the direct connection string for Prisma migrations.",
      );
    }
    return directUrl;
  }
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl && isLocalDatabaseUrl(databaseUrl)) {
    return databaseUrl;
  }
  return undefined;
}
