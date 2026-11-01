import {
  isLocalDatabaseUrl,
  isNeonPooledUrl,
  isPostgresUrl,
  NEON_ENDPOINT_ID_PATTERN,
  neonEndpointId,
} from "./database-url";

type Env = Record<string, string | undefined>;

/**
 * 実行環境。Vercel が設定する VERCEL_ENV で判定する。
 * Vercel 以外（開発・テスト・CI・ローカルでの next start）はすべて local。
 */
export type DeploymentEnv = "production" | "preview" | "local";

export function getDeploymentEnv(env: Env = process.env): DeploymentEnv {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  // Vercel 上（VERCEL=1）で VERCEL_ENV が想定外の値・未設定の場合は、制限の厳しい preview として扱う
  // （検証なし・メール制限なしの local と誤判定しないため）。production の設定は適用しない
  if (env.VERCEL === "1") return "preview";
  return "local";
}

export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/**
 * DATABASE_URL の接続先が、その環境で使ってよい DB かを検査する。
 * - Production: PRODUCTION_DB_ENDPOINT_ID の DB であること（Preview 用 DB の誤設定を防ぐ）
 * - Preview: PRODUCTION_DB_ENDPOINT_ID の DB ではないこと（Preview から本番 DB への接続を防ぐ）
 */
export function checkDatabaseIsolation(env: Env = process.env): string[] {
  const deployment = getDeploymentEnv(env);
  if (deployment === "local") {
    // Vercel のシステム環境変数が無効などで環境を判定できないまま、本番ビルドがリモートの DB に
    // 接続しようとしている場合は、本番・Preview の検証を経ずに動くことになるため拒否する
    if (env.NODE_ENV === "production" && env.DATABASE_URL && !isLocalDatabaseUrl(env.DATABASE_URL)) {
      return [
        "Cannot determine the deployment environment (VERCEL_ENV) while connecting to a remote database. " +
          "Enable 'Automatically expose System Environment Variables' in Vercel. Production builds may use only a local database outside Vercel.",
      ];
    }
    return [];
  }

  const errors: string[] = [];
  const databaseUrl = env.DATABASE_URL;
  const productionEndpoint = env.PRODUCTION_DB_ENDPOINT_ID;

  if (!databaseUrl || !isPostgresUrl(databaseUrl)) {
    errors.push("DATABASE_URL must be set to a PostgreSQL connection string.");
  } else if (!isNeonPooledUrl(databaseUrl)) {
    errors.push("DATABASE_URL must be a Neon pooled connection (-pooler).");
  }
  if (!productionEndpoint || !NEON_ENDPOINT_ID_PATTERN.test(productionEndpoint)) {
    errors.push("PRODUCTION_DB_ENDPOINT_ID must be set to the Neon endpoint ID of the production branch (ep-...).");
  }
  if (errors.length > 0) return errors;

  const endpoint = neonEndpointId(databaseUrl!);
  if (deployment === "production" && endpoint !== productionEndpoint) {
    errors.push("DATABASE_URL does not point to the production database (PRODUCTION_DB_ENDPOINT_ID).");
  }
  if (deployment === "preview" && endpoint === productionEndpoint) {
    errors.push("DATABASE_URL points to the production database. Preview deployments must use the preview branch.");
  }
  return errors;
}

/** https:// で始まり、パスを含まないオリジンか（例: https://projects.example.com） */
function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value.replace(/\/$/, "");
  } catch {
    return false;
  }
}

/**
 * Vercel の Production / Preview で必要な環境変数を検証し、問題点の一覧を返す（空なら問題なし）。
 * local（開発・テスト・CI）では、本番ビルドがリモートの DB を使っていないかだけを検証する。
 * メッセージには変数名だけを含め、値は出さない。
 */
export function validateServerEnv(env: Env = process.env): string[] {
  const deployment = getDeploymentEnv(env);
  if (deployment === "local") return checkDatabaseIsolation(env);

  const errors = checkDatabaseIsolation(env);

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < BETTER_AUTH_SECRET_MIN_LENGTH) {
    errors.push(`BETTER_AUTH_SECRET must be set (at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters).`);
  }
  if (env.DISABLE_AUTH_RATE_LIMIT === "true") {
    errors.push("DISABLE_AUTH_RATE_LIMIT must not be set on Vercel deployments.");
  }

  if (deployment === "production") {
    if (!env.BETTER_AUTH_URL || !isHttpsOrigin(env.BETTER_AUTH_URL)) {
      errors.push("BETTER_AUTH_URL must be set to the https origin of the production site (no path).");
    } else if (!env.VERCEL_PROJECT_PRODUCTION_URL) {
      errors.push(
        "VERCEL_PROJECT_PRODUCTION_URL is missing. Enable 'Automatically expose System Environment Variables' in Vercel.",
      );
    } else if (new URL(env.BETTER_AUTH_URL).origin !== `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`) {
      // Better Auth は BETTER_AUTH_URL のオリジンだけを信頼するため、本番ドメインと違うと
      // 登録・ログイン・パスワード再設定がすべて INVALID_ORIGIN で拒否され、再設定メールのリンクも誤った URL になる。
      // VERCEL_PROJECT_PRODUCTION_URL は Vercel が設定する本番ドメイン（独自ドメインのうち最も短いもの）
      errors.push(
        "BETTER_AUTH_URL must match the production domain of the Vercel project (VERCEL_PROJECT_PRODUCTION_URL).",
      );
    }
    if (!env.RESEND_API_KEY) errors.push("RESEND_API_KEY must be set.");
    if (!env.MAIL_FROM) errors.push("MAIL_FROM must be set.");
  }

  if (deployment === "preview") {
    // Preview の認証 URL はデプロイごとの URL から決める（src/lib/auth/origins.ts）
    if (env.BETTER_AUTH_URL) {
      errors.push("BETTER_AUTH_URL must not be set for Preview (the deployment URL is used instead).");
    }
    if (!env.VERCEL_URL) {
      errors.push("VERCEL_URL is missing. Enable 'Automatically expose System Environment Variables' in Vercel.");
    }
    if (env.RESEND_API_KEY && !env.MAIL_FROM) errors.push("MAIL_FROM must be set when RESEND_API_KEY is set.");
  }

  return errors;
}

/** 環境変数に問題があれば例外を投げる（サーバー起動時に instrumentation.ts から呼ぶ） */
export function assertServerEnv(env: Env = process.env): void {
  const errors = validateServerEnv(env);
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables for the ${getDeploymentEnv(env)} deployment:\n- ${errors.join("\n- ")}`,
    );
  }
}
