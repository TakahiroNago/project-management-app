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
import { type SignUpValues, signUpSchema } from "../schemas";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", passwordConfirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    setFormError(undefined);
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.auth.register.title}</CardTitle>
        <CardDescription>{m.auth.register.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <InputField
              id="name"
              autoComplete="name"
              label={m.auth.fields.name}
              error={errors.name}
              {...form.register("name")}
            />
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
              autoComplete="new-password"
              label={m.auth.fields.password}
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
              {isSubmitting ? m.auth.register.submitting : m.auth.register.submit}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {m.auth.register.hasAccount}{" "}
              <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                {m.auth.register.toLogin}
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
