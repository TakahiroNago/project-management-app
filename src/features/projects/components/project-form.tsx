"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { InputField, SelectField, TextareaField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { m } from "@/i18n";
import { applyFieldErrors } from "@/lib/form";
import { createProjectAction, updateProjectAction } from "../actions";
import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  PROJECT_STATUSES,
  type ProjectFormValues,
  type ProjectInput,
  projectInputSchema,
} from "../schemas";

const STATUS_OPTIONS = PROJECT_STATUSES.map((value) => ({ value, label: m.project.status[value] }));

type Props =
  | { mode: "create"; defaultValues?: undefined; projectId?: undefined }
  | { mode: "edit"; defaultValues: ProjectFormValues; projectId: string };

export function ProjectForm({ mode, defaultValues, projectId }: Props) {
  const router = useRouter();
  const form = useForm<ProjectFormValues, unknown, ProjectInput>({
    resolver: zodResolver(projectInputSchema),
    defaultValues: defaultValues ?? {
      name: "",
      description: "",
      status: "PLANNING",
      startDate: "",
      dueDate: "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (mode === "create") {
      const result = await createProjectAction(values);
      if (!result.ok) {
        applyFieldErrors(form.setError, result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success(m.project.created);
      router.push(`/projects/${result.data.id}`);
    } else {
      const result = await updateProjectAction(projectId, values);
      if (!result.ok) {
        applyFieldErrors(form.setError, result.fieldErrors);
        toast.error(result.error);
        return;
      }
      toast.success(m.project.updated);
      form.reset(form.getValues());
      router.refresh();
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <FieldGroup>
        <InputField
          id="project-name"
          label={m.project.fields.name}
          maxLength={PROJECT_NAME_MAX}
          error={errors.name}
          {...form.register("name")}
        />
        <TextareaField
          id="project-description"
          label={m.project.fields.description}
          rows={4}
          maxLength={PROJECT_DESCRIPTION_MAX}
          error={errors.description}
          {...form.register("description")}
        />
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <SelectField
              id="project-status"
              label={m.project.fields.status}
              value={field.value}
              onValueChange={field.onChange}
              options={STATUS_OPTIONS}
              error={errors.status}
            />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="project-start-date"
            type="date"
            label={m.project.fields.startDate}
            error={errors.startDate}
            {...form.register("startDate")}
          />
          <InputField
            id="project-due-date"
            type="date"
            label={m.project.fields.dueDate}
            error={errors.dueDate}
            {...form.register("dueDate")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? m.common.saving : mode === "create" ? m.common.create : m.common.save}
          </Button>
          {mode === "create" && (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              {m.common.cancel}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
