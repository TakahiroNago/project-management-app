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
import { type ForgotPasswordValues, forgotPasswordSchema } from "../schemas";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string>();
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setFormError(undefined);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    // 登録の有無にかかわらず同じ表示にする（メールアドレスの列挙対策）
    setSent(true);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.auth.forgotPassword.title}</CardTitle>
        <CardDescription>{m.auth.forgotPassword.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            <p role="status" className="text-sm">
              {m.auth.forgotPassword.sent}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">{m.auth.forgotPassword.backToLogin}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <InputField
                id="email"
                type="email"
                autoComplete="email"
                label={m.auth.fields.email}
                error={errors.email}
                {...form.register("email")}
              />
              {formError && <FieldError role="alert">{formError}</FieldError>}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? m.auth.forgotPassword.submitting : m.auth.forgotPassword.submit}
              </Button>
              <Link href="/login" className="text-center text-sm text-muted-foreground hover:underline">
                {m.auth.forgotPassword.backToLogin}
              </Link>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
