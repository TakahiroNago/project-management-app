import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { m } from "@/i18n";

export const metadata: Metadata = { title: m.auth.login.title };

export default function LoginPage() {
  return <LoginForm />;
}
