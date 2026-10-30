import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/i18n";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={m.common.loading}>
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
