import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/settings/components/change-password-form";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { m } from "@/i18n";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: m.settings.title };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <PageHeader title={m.settings.title} description={user.email} />
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.profile.title}</CardTitle>
          <CardDescription>{m.settings.profile.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{m.settings.password.title}</CardTitle>
          <CardDescription>{m.settings.password.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {user.isDemo ? (
            <p className="text-sm text-muted-foreground">{m.demo.passwordUnavailable}</p>
          ) : (
            <ChangePasswordForm />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
