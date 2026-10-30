import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { ProjectTabs } from "@/features/projects/components/project-tabs";
import { getProjectForUser } from "@/features/projects/queries";
import { can } from "@/domain/permissions";
import { m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const user = await requireUser();
  const { projectId } = await params;
  // メンバーでなければ存在しないものとして扱う
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <PageHeader
          title={project.name}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <ProjectStatusBadge status={project.status} />
              <Badge variant="outline">{m.project.role[project.role]}</Badge>
            </span>
          }
        />
        <ProjectTabs projectId={project.id} showSettings={can(project.role, "project:update")} />
      </div>
      {children}
    </div>
  );
}
