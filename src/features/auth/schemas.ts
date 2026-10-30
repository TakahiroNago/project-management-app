import { z } from "zod";
import { m } from "@/i18n";
import { requiredText } from "@/lib/validation";

/** Better Auth の設定（src/lib/auth/auth.ts）と同じ値を使う */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const USER_NAME_MAX = 50;

const email = z.string().trim().toLowerCase().pipe(z.email({ error: m.validation.invalidEmail }));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: m.validation.passwordMin(PASSWORD_MIN_LENGTH) })
  .max(PASSWORD_MAX_LENGTH, { error: m.validation.passwordMax(PASSWORD_MAX_LENGTH) });

const passwordsMatch = (data: { password: string; passwordConfirm: string }) =>
  data.password === data.passwordConfirm;

export const signUpSchema = z
  .object({
    name: requiredText(USER_NAME_MAX),
    email,
    password: newPassword,
    passwordConfirm: z.string(),
  })
  .refine(passwordsMatch, { error: m.validation.passwordMismatch, path: ["passwordConfirm"] });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: m.validation.required }),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, passwordConfirm: z.string() })
  .refine(passwordsMatch, { error: m.validation.passwordMismatch, path: ["passwordConfirm"] });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: m.validation.required }),
    password: newPassword,
    passwordConfirm: z.string(),
  })
  .refine(passwordsMatch, { error: m.validation.passwordMismatch, path: ["passwordConfirm"] });

export const profileSchema = z.object({ name: requiredText(USER_NAME_MAX) });

export type SignUpValues = z.infer<typeof signUpSchema>;
export type SignInValues = z.infer<typeof signInSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
