"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { InputField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { m } from "@/i18n";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "../error-message";
import { type ResetPasswordValues, resetPasswordSchema } from "../schemas";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [status, setStatus] = useState<"idle" | "done" | "invalid">(token ? "idle" : "invalid");
  const [formError, setFormError] = useState<string>();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!token) return;
    setFormError(undefined);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      if (error.code === "INVALID_TOKEN") setStatus("invalid");
      else setFormError(authErrorMessage(error));
      return;
    }
    setStatus("done");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.auth.resetPassword.title}</CardTitle>
        {status === "idle" && <CardDescription>{m.auth.resetPassword.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {status === "invalid" && (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {m.auth.resetPassword.invalidToken}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/forgot-password">{m.auth.resetPassword.requestAgain}</Link>
            </Button>
          </div>
        )}
        {status === "done" && (
          <div className="space-y-4">
            <p role="status" className="text-sm">
              {m.auth.resetPassword.success}
            </p>
            <Button asChild className="w-full">
              <Link href="/login">{m.auth.login.submit}</Link>
            </Button>
          </div>
        )}
        {status === "idle" && (
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <InputField
                id="password"
                type="password"
                autoComplete="new-password"
                label={m.auth.fields.newPassword}
                error={errors.password}
                {...form.register("password")}
              />
              <InputField
                id="passwordConfirm"
                type="password"
                autoComplete="new-password"
                label={m.auth.fields.passwordConfirm}
                error={errors.passwordConfirm}
                {...form.register("passwordConfirm")}
              />
              {formError && <FieldError role="alert">{formError}</FieldError>}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? m.auth.resetPassword.submitting : m.auth.resetPassword.submit}
              </Button>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
