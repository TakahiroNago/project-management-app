"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, parseInput, runAction } from "@/lib/action-result";
import { requireActionUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { projectInputSchema } from "./schemas";
import { createProject, deleteProject, updateProject } from "./service";

// すべての Action で ①認証 → ②入力検証 → ③認可（サービス層）→ ④DB 操作 → ⑤再検証 の順に処理する

export async function createProjectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireActionUser();
    const data = parseInput(projectInputSchema, input);
    const project = await createProject(user.id, data);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { id: project.id };
  });
}

export async function updateProjectAction(projectId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, projectId);
    const data = parseInput(projectInputSchema, input);
    await updateProject(user.id, id, data);
    revalidatePath(`/projects/${id}`, "layout");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
  });
}

export async function deleteProjectAction(projectId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, projectId);
    await deleteProject(user.id, id);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
  });
}
