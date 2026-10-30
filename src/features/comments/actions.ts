"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, parseInput, runAction } from "@/lib/action-result";
import { requireActionUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/validation";
import { commentSchema } from "./schemas";
import { createComment, deleteComment, updateComment } from "./service";

export async function createCommentAction(taskId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, taskId);
    const { content } = parseInput(commentSchema, input);
    const { projectId } = await createComment(user.id, id, content);
    revalidatePath(`/projects/${projectId}`, "layout");
  });
}

export async function updateCommentAction(commentId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, commentId);
    const { content } = parseInput(commentSchema, input);
    const { projectId } = await updateComment(user.id, id, content);
    revalidatePath(`/projects/${projectId}`, "layout");
  });
}

export async function deleteCommentAction(commentId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireActionUser();
    const id = parseInput(idSchema, commentId);
    const { projectId } = await deleteComment(user.id, id);
    revalidatePath(`/projects/${projectId}`, "layout");
  });
}
