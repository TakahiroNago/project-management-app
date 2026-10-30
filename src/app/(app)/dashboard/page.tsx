import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: m.dashboard.title };

// 集計・直近タスク・進捗率の表示は Phase 2 で実装する
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <PageHeader title={m.dashboard.title} description={m.dashboard.welcome(user.name)} />
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        <p>{m.dashboard.comingSoon}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/projects">{m.dashboard.toProjects}</Link>
        </Button>
      </div>
    </div>
  );
}
