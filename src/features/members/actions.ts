"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, parseInput, runAction } from "@/lib/action-result";
import { requireActionUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { addMemberSchema } from "./schemas";
import { addMember, removeMember } from "./service";

export async function addMemberAction(projectId: unknown, input: unknown): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, projectId);
    const { email } = parseInput(addMemberSchema, input);
    const member = await addMember(user.id, id, email);
    revalidatePath(`/projects/${id}`, "layout");
    return { name: member.name };
  });
}

export async function removeMemberAction(projectId: unknown, memberUserId: unknown): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, projectId);
    const targetId = parseInput(idSchema, memberUserId);
    const { name } = await removeMember(user.id, id, targetId);
    revalidatePath(`/projects/${id}`, "layout");
    revalidatePath("/dashboard");
    return { name };
  });
}
