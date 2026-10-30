"use client";

import type { ComponentProps, ReactNode } from "react";
import type { FieldError as RHFFieldError } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type BaseProps = {
  id: string;
  label: ReactNode;
  error?: RHFFieldError;
};

export function InputField({ id, label, error, ...props }: BaseProps & ComponentProps<typeof Input>) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} aria-invalid={!!error} {...props} />
      <FieldError errors={[error]} />
    </Field>
  );
}

export function TextareaField({
  id,
  label,
  error,
  ...props
}: BaseProps & ComponentProps<typeof Textarea>) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} aria-invalid={!!error} {...props} />
      <FieldError errors={[error]} />
    </Field>
  );
}

export function SelectField({
  id,
  label,
  error,
  value,
  onValueChange,
  options,
}: BaseProps & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-invalid={!!error} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={[error]} />
    </Field>
  );
}
