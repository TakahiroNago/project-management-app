"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { InputField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { m } from "@/i18n";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "../error-message";
import { type SignInValues, signInSchema } from "../schemas";

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setFormError(authErrorMessage(error, m.auth.login.failed));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.auth.login.title}</CardTitle>
        <CardDescription>{m.auth.login.description}</CardDescription>
      </CardHeader>
      <CardContent>
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
            <InputField
              id="password"
              type="password"
              autoComplete="current-password"
              label={m.auth.fields.password}
              error={errors.password}
              {...form.register("password")}
            />
            {formError && <FieldError role="alert">{formError}</FieldError>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? m.auth.login.submitting : m.auth.login.submit}
            </Button>
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Link href="/forgot-password" className="hover:underline">
                {m.auth.login.forgotPassword}
              </Link>
              <p>
                {m.auth.login.noAccount}{" "}
                <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
                  {m.auth.login.toRegister}
                </Link>
              </p>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
