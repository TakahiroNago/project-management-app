"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { authErrorMessage } from "@/features/auth/error-message";
import { m } from "@/i18n";
import { authClient } from "@/lib/auth/auth-client";

/** ログイン画面の「デモを試す」。一時的なユーザーを作成してログインし、ダッシュボードへ移動する */
export function StartDemoButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setPending(true);
    setError(undefined);
    const { error } = await authClient.signIn.anonymous();
    if (error) {
      setError(
        error.status === 429
          ? m.demo.tooManyRequests
          : error.code === "DEMO_UNAVAILABLE"
            ? m.demo.unavailable
            : authErrorMessage(error, m.demo.failed),
      );
      setPending(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={start}>
        {pending ? m.demo.starting : m.demo.start}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{m.demo.startDescription}</p>
      {error && <FieldError role="alert">{error}</FieldError>}
    </div>
  );
}
