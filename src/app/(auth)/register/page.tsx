import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/components/register-form";
import { m } from "@/i18n";

export const metadata: Metadata = { title: m.auth.register.title };

export default function RegisterPage() {
  return <RegisterForm />;
}
