import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { m } from "@/i18n";

export const metadata: Metadata = { title: m.auth.forgotPassword.title };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
