import "server-only";
import { authorizeProject } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

/** プロジェクトのメンバー一覧（Owner が先頭）。メンバーでなければ NotFoundError */
export async function listMembers(userId: string, projectId: string) {
  await authorizeProject(db, { projectId, userId, permission: "member:view" });
  return db.projectMember.findMany({
    where: { projectId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      role: true,
      joinedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export type MemberListItem = Awaited<ReturnType<typeof listMembers>>[number];
