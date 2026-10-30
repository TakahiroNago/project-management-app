import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/domain/permissions";
import { AddMemberForm } from "@/features/members/components/add-member-form";
import { RemoveMemberButton } from "@/features/members/components/remove-member-button";
import { listMembers } from "@/features/members/queries";
import { getProjectForUser } from "@/features/projects/queries";
import { m } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: m.member.title };

export default async function MembersPage({ params }: PageProps<"/projects/[projectId]/members">) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = await getProjectForUser(user.id, projectId);
  if (!project) notFound();

  const members = await listMembers(user.id, project.id);
  // UI の出し分けのみ。追加・削除の権限は Server Action 側でも必ず検証している
  const canManage = can(project.role, "member:manage");

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{m.member.addTitle}</CardTitle>
            <CardDescription>{m.member.addDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <AddMemberForm projectId={project.id} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {m.member.title} <span className="text-sm font-normal text-muted-foreground">{m.member.count(members.length)}</span>
          </CardTitle>
          <CardDescription>{canManage ? m.member.description : m.member.ownerOnly}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y" data-testid="member-list">
            {members.map((member) => (
              <li key={member.user.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar className="size-9">
                  <AvatarFallback>{member.user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="break-all">{member.user.name}</span>
                    {member.user.id === user.id && <span className="text-xs text-muted-foreground">({m.member.you})</span>}
                    <Badge variant={member.role === "OWNER" ? "default" : "outline"}>{m.project.role[member.role]}</Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user.email} · {m.member.joinedAt} {formatDateTime(member.joinedAt)}
                  </p>
                </div>
                {canManage && member.role !== "OWNER" && (
                  <RemoveMemberButton projectId={project.id} userId={member.user.id} name={member.user.name} />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
