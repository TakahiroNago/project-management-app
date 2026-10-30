"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, parseInput, runAction } from "@/lib/action-result";
import { requireActionUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { taskInputSchema } from "./schemas";
import { createTask, deleteTask, updateTask } from "./service";

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function createTaskAction(projectId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, projectId);
    const data = parseInput(taskInputSchema, input);
    await createTask(user.id, id, data);
    revalidateProject(id);
  });
}

export async function updateTaskAction(taskId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, taskId);
    const data = parseInput(taskInputSchema, input);
    const task = await updateTask(user.id, id, data);
    revalidateProject(task.projectId);
  });
}

export async function deleteTaskAction(taskId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, taskId);
    const { projectId } = await deleteTask(user.id, id);
    revalidateProject(projectId);
  });
}
