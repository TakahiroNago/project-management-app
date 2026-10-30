import { redirect } from "next/navigation";
import { m } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // ログイン済みならダッシュボードへ（セッションは DB で検証済み）
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4 sm:p-6">
      <p className="text-lg font-semibold tracking-tight">{m.app.name}</p>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
