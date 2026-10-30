"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { m } from "@/i18n";
import { applyFieldErrors } from "@/lib/form";
import { addMemberAction } from "../actions";
import { type AddMemberValues, addMemberSchema } from "../schemas";

export function AddMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const form = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await addMemberAction(projectId, values);
    if (!result.ok) {
      applyFieldErrors(form.setError, result.fieldErrors);
      if (!result.fieldErrors?.email) toast.error(result.error);
      return;
    }
    toast.success(m.member.added(result.data.name));
    form.reset();
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Field data-invalid={!!errors.email} className="flex-1">
        <FieldLabel htmlFor="member-email" className="sr-only">
          {m.auth.fields.email}
        </FieldLabel>
        <Input
          id="member-email"
          type="email"
          autoComplete="off"
          placeholder={m.auth.fields.email}
          aria-invalid={!!errors.email}
          {...form.register("email")}
        />
        <FieldError errors={[errors.email]} />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? m.member.adding : m.member.addButton}
      </Button>
    </form>
  );
}
