import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { m } from "@/i18n";

export const metadata: Metadata = {
  title: m.auth.resetPassword.title,
  // トークンを含む URL を Referer で外部に送らない
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  // 期限切れ・無効なトークンの場合、Better Auth は ?error=INVALID_TOKEN を付けてリダイレクトする
  const validToken = !error && typeof token === "string" && token.length > 0 ? token : null;
  return <ResetPasswordForm token={validToken} />;
}
