"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { InputField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authErrorMessage } from "@/features/auth/error-message";
import { type ChangePasswordValues, changePasswordSchema } from "@/features/auth/schemas";
import { m } from "@/i18n";
import { authClient } from "@/lib/auth/auth-client";

export function ChangePasswordForm() {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", passwordConfirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, password }) => {
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword: password,
      // この端末以外のセッションをすべて無効化する
      revokeOtherSessions: true,
    });
    if (error) {
      if (error.code === "INVALID_PASSWORD") {
        form.setError("currentPassword", { message: m.settings.password.wrongCurrent });
      } else {
        toast.error(authErrorMessage(error));
      }
      return;
    }
    toast.success(m.settings.password.updated);
    form.reset();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md">
      <FieldGroup>
        <InputField
          id="current-password"
          type="password"
          autoComplete="current-password"
          label={m.auth.fields.currentPassword}
          error={errors.currentPassword}
          {...form.register("currentPassword")}
        />
        <InputField
          id="new-password"
          type="password"
          autoComplete="new-password"
          label={m.auth.fields.newPassword}
          error={errors.password}
          {...form.register("password")}
        />
        <InputField
          id="new-password-confirm"
          type="password"
          autoComplete="new-password"
          label={m.auth.fields.passwordConfirm}
          error={errors.passwordConfirm}
          {...form.register("passwordConfirm")}
        />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? m.common.saving : m.settings.password.submit}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
