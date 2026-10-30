"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n";

/** 予期しないエラー。詳細はクライアントに表示せず、digest のみ問い合わせ用に表示する */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <p className="font-medium">{m.errors.unexpected}</p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">ID: {error.digest}</p>}
      <Button variant="outline" onClick={reset}>
        {m.errors.retry}
      </Button>
    </div>
  );
}
