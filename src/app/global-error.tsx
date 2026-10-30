"use client";

import { m } from "@/i18n";
import "./globals.css";

/**
 * ルートレイアウト自体で発生したエラーの表示（通常のエラーは (app)/error.tsx が表示する）。
 * ルートレイアウトを置き換えるため html / body を含める。詳細は表示せず、digest のみ問い合わせ用に表示する。
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">{m.errors.unexpected}</h1>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">ID: {error.digest}</p>}
        <button type="button" onClick={reset} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
          {m.errors.retry}
        </button>
      </body>
    </html>
  );
}
