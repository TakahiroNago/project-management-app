import Link from "next/link";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n";

export default function NotFound() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">{m.errors.pageNotFound}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{m.errors.pageNotFoundDescription}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link href="/dashboard">{m.errors.toDashboard}</Link>
      </Button>
    </div>
  );
}
