import { z } from "zod";
import { m } from "@/i18n";

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: m.validation.invalidEmail })),
});

export type AddMemberValues = z.infer<typeof addMemberSchema>;
