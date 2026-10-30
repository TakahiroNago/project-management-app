"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { InputField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authErrorMessage } from "@/features/auth/error-message";
import { type ProfileValues, profileSchema, USER_NAME_MAX } from "@/features/auth/schemas";
import { m } from "@/i18n";
import { authClient } from "@/lib/auth/auth-client";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    // Better Auth の update-user はセッションのユーザー本人のみを更新する（他人の ID は指定できない）
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success(m.settings.profile.updated);
    form.reset(values);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md">
      <FieldGroup>
        <InputField
          id="profile-name"
          autoComplete="name"
          maxLength={USER_NAME_MAX}
          label={m.auth.fields.name}
          error={errors.name}
          {...form.register("name")}
        />
        <div>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? m.common.saving : m.common.save}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
