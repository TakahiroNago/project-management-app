import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/features/projects/components/project-form";
import { m } from "@/i18n";

export const metadata: Metadata = { title: m.project.newTitle };

export default function NewProjectPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={m.project.newTitle} />
      <ProjectForm mode="create" />
    </div>
  );
}
