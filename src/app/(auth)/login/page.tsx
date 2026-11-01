import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { StartDemoButton } from "@/features/demo/components/start-demo-button";
import { m } from "@/i18n";

export const metadata: Metadata = { title: m.auth.login.title };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <LoginForm />
      <StartDemoButton />
    </div>
  );
}
