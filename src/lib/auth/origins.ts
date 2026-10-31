import { getDeploymentEnv } from "@/lib/env";

type Env = Record<string, string | undefined>;

export type AuthOrigins = {
  /** 認証の基準 URL。パスワード再設定メールのリンクもこの URL から作られる */
  baseURL: string | undefined;
  /** baseURL 以外に Origin 検証で許可するオリジン（ワイルドカードは使わない） */
  trustedOrigins: string[];
};

function toHttpsOrigin(host: string | undefined): string | undefined {
  return host ? `https://${host}` : undefined;
}

/**
 * Better Auth の baseURL と信頼するオリジンを決める。
 *
 * - Production / local: BETTER_AUTH_URL（本番は https://projects.art-full-stack.com）だけを信頼する。
 * - Preview: そのデプロイ自身の URL（Vercel が設定する VERCEL_BRANCH_URL と VERCEL_URL）だけを信頼する。
 *   *.vercel.app のようなワイルドカードは使わないため、他のデプロイや他人のサイトからは認証 API を呼べない。
 *   再設定メールのリンクはブランチの URL（無ければデプロイの URL）になり、本番ドメインを指さない。
 */
export function resolveAuthOrigins(env: Env = process.env): AuthOrigins {
  if (getDeploymentEnv(env) !== "preview") {
    return { baseURL: env.BETTER_AUTH_URL, trustedOrigins: [] };
  }
  const deploymentOrigin = toHttpsOrigin(env.VERCEL_URL);
  const branchOrigin = toHttpsOrigin(env.VERCEL_BRANCH_URL);
  const trustedOrigins = [...new Set([branchOrigin, deploymentOrigin].filter((origin) => origin !== undefined))];
  return { baseURL: branchOrigin ?? deploymentOrigin, trustedOrigins };
}
