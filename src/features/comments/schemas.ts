import { z } from "zod";
import { requiredText } from "@/lib/validation";

export const COMMENT_MAX = 2000;

export const commentSchema = z.object({ content: requiredText(COMMENT_MAX) });

export type CommentValues = z.infer<typeof commentSchema>;
