import { FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SimplePagination } from "@/components/simple-pagination";
import { Button } from "@/components/ui/button";
import { ProjectFilters } from "@/features/projects/components/project-filters";
import { ProjectList } from "@/features/projects/components/project-list";
import { listProjectsForUser } from "@/features/projects/queries";
import { PROJECTS_PER_PAGE, projectListQuerySchema } from "@/features/projects/schemas";
import { m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: m.project.listTitle };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await requireUser();
  const query = projectListQuerySchema.parse(await searchParams);
  const { items, total, page, pageCount } = await listProjectsForUser(user.id, query);
  const isFiltered = Boolean(query.q || query.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.project.listTitle}
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus /> {m.project.newButton}
            </Link>
          </Button>
        }
      />
      <ProjectFilters query={query} />
      {items.length > 0 ? (
        <ProjectList projects={items} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <FolderKanban className="size-8 text-muted-foreground" />
          <p className="font-medium">{isFiltered ? m.project.emptyFiltered : m.project.empty}</p>
          {!isFiltered && <p className="text-sm text-muted-foreground">{m.project.emptyHint}</p>}
        </div>
      )}
      <SimplePagination
        page={page}
        pageCount={pageCount}
        total={total}
        perPage={PROJECTS_PER_PAGE}
        searchParams={{
          q: query.q || undefined,
          status: query.status,
          sort: query.sort === "updated" ? undefined : query.sort,
        }}
      />
    </div>
  );
}
