import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts は Cookie の有無しか見ないため、ここで DB のセッションを検証する
  const user = await requireUser();

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
          <SidebarTrigger className="-ml-1" aria-label={m.nav.toggleSidebar} />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {user.isDemo && (
          <p role="status" className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {m.demo.banner}
          </p>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
