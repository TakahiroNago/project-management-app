import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/i18n";

// プロジェクトの存在確認（notFound）は上位のレイアウトで済んでいるため、ここでのストリーミングは 404 に影響しない
export default function BoardLoading() {
  return (
    <div className="flex gap-4 overflow-hidden lg:grid lg:grid-cols-3" aria-busy="true" aria-label={m.common.loading}>
      {Array.from({ length: 3 }, (_, column) => (
        <div key={column} className="w-[85vw] max-w-sm shrink-0 space-y-2 rounded-xl bg-muted/50 p-3 sm:w-80 lg:w-auto lg:max-w-none">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 3 - column }, (_, card) => (
            <Skeleton key={card} className="h-16" />
          ))}
        </div>
      ))}
    </div>
  );
}
