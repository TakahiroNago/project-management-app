import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/permissions";
import { toDateOnlyString } from "@/domain/dates";
import { DeleteProjectButton } from "@/features/projects/components/delete-project-button";
import { ProjectForm } from "@/features/projects/components/project-form";
import { getProjectForUser } from "@/features/projects/queries";
import { m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: m.project.settingsTitle };

export default async function ProjectSettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  // Member には表示しない（Server Action 側でも Owner であることを検証している）
  if (!can(project.role, "project:update")) {
    return <p className="text-sm text-muted-foreground">{m.project.ownerOnly}</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.project.settingsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            mode="edit"
            projectId={project.id}
            defaultValues={{
              name: project.name,
              description: project.description ?? "",
              status: project.status,
              startDate: project.startDate ? toDateOnlyString(project.startDate) : "",
              dueDate: project.dueDate ? toDateOnlyString(project.dueDate) : "",
            }}
          />
        </CardContent>
      </Card>
      {can(project.role, "project:delete") && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>{m.project.dangerZone}</CardTitle>
            <CardDescription className="break-words">{m.project.deleteDescription(project.name)}</CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
