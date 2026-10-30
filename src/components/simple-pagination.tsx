import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n";

/** 前へ / 次へ のみのページネーション。他の検索条件は維持する */
export function SimplePagination({
  page,
  pageCount,
  total,
  perPage,
  searchParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (total === 0) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `?${search}` : "?";
  };

  const from = Math.min((page - 1) * perPage + 1, total);
  const to = Math.min(page * perPage, total);

  return (
    <nav aria-label="pagination" className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{m.pagination.summary(from, to, total)}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>
              <ChevronLeft /> {m.pagination.previous}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft /> {m.pagination.previous}
          </Button>
        )}
        {page < pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>
              {m.pagination.next} <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            {m.pagination.next} <ChevronRight />
          </Button>
        )}
      </div>
    </nav>
  );
}
