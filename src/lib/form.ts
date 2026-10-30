import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Server Action が返した項目ごとのエラーを React Hook Form に反映する */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string[] | undefined> | undefined,
) {
  for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
    if (messages?.[0]) {
      setError(field as Path<T>, { type: "server", message: messages[0] });
    }
  }
}
