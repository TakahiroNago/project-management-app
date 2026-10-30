"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { TaskThread } from "@/features/tasks/thread";
import { m } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { applyFieldErrors } from "@/lib/form";
import { createCommentAction, deleteCommentAction, updateCommentAction } from "../actions";
import { COMMENT_MAX, type CommentValues, commentSchema } from "../schemas";

type Comment = TaskThread["comments"][number];

function CommentForm({
  defaultValue = "",
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  defaultValue?: string;
  submitLabel: string;
  onSubmit: (values: CommentValues) => Promise<{ ok: boolean; fieldErrors?: Record<string, string[] | undefined> }>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const form = useForm<CommentValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: { content: defaultValue },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    const result = await onSubmit(values);
    if (result.ok) form.reset({ content: "" });
    else applyFieldErrors(form.setError, result.fieldErrors);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <Field data-invalid={!!errors.content}>
        <Textarea
          aria-label={m.comment.title}
          placeholder={m.comment.placeholder}
          rows={2}
          maxLength={COMMENT_MAX}
          aria-invalid={!!errors.content}
          autoFocus={autoFocus}
          {...form.register("content")}
        />
        <FieldError errors={[errors.content]} />
      </Field>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {m.common.cancel}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? m.comment.submitting : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CommentItem({ comment, isMine }: { comment: Comment; isMine: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const edited = comment.updatedAt.getTime() > comment.createdAt.getTime();

  function onDelete() {
    startDelete(async () => {
      const result = await deleteCommentAction(comment.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(m.comment.deleted);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <li className="space-y-1" data-testid="comment" aria-busy={isDeleting}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{comment.user.name}</span>{" "}
          <time dateTime={comment.createdAt.toISOString()}>{formatDateTime(comment.createdAt)}</time>
          {edited && ` ${m.comment.edited}`}
        </p>
        {isMine && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={m.comment.actionsLabel(comment.user.name)}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil /> {m.comment.editButton}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2 /> {m.comment.deleteButton}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing ? (
        <CommentForm
          defaultValue={comment.content}
          submitLabel={m.comment.save}
          autoFocus
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const result = await updateCommentAction(comment.id, values);
            if (!result.ok) {
              toast.error(result.error);
              return result;
            }
            toast.success(m.comment.updated);
            setEditing(false);
            router.refresh();
            return result;
          }}
        />
      ) : (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap break-words">{comment.content}</p>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.comment.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3 break-words">{comment.content}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{m.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                onDelete();
              }}
            >
              {isDeleting ? m.common.deleting : m.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function CommentSection({
  taskId,
  comments,
  currentUserId,
}: {
  taskId: string;
  comments: Comment[];
  currentUserId: string;
}) {
  const router = useRouter();

  return (
    <section className="space-y-3" aria-labelledby="comments-heading">
      <h3 id="comments-heading" className="text-sm font-semibold">
        {m.comment.title} <span className="font-normal text-muted-foreground">({comments.length})</span>
      </h3>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.comment.empty}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} isMine={comment.user.id === currentUserId} />
          ))}
        </ul>
      )}
      <CommentForm
        submitLabel={m.comment.submit}
        onSubmit={async (values) => {
          const result = await createCommentAction(taskId, values);
          if (!result.ok) {
            toast.error(result.error);
            return result;
          }
          router.refresh();
          return result;
        }}
      />
    </section>
  );
}
