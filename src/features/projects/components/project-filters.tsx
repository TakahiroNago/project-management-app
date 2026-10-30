"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useTransition } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { m } from "@/i18n";
import { PROJECT_SORTS, PROJECT_STATUSES, type ProjectListQuery } from "../schemas";

const ALL = "ALL";

/** 検索・絞り込み・並べ替えの状態は URL の searchParams で管理する（共有・リロードしても維持される） */
export function ProjectFilters({ query }: { query: ProjectListQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function navigate(next: Partial<Record<"q" | "status" | "sort", string | undefined>>) {
    const params = new URLSearchParams();
    const merged = { q: query.q, status: query.status, sort: query.sort, ...next };
    if (merged.q) params.set("q", merged.q);
    if (merged.status) params.set("status", merged.status);
    if (merged.sort && merged.sort !== "updated") params.set("sort", merged.sort);
    // 条件が変わったら 1 ページ目に戻す
    const search = params.toString();
    startTransition(() => router.push(search ? `${pathname}?${search}` : pathname));
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q");
    navigate({ q: typeof q === "string" ? q.trim() : "" });
  }

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center" aria-busy={isPending}>
      <form onSubmit={onSearch} role="search" className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          key={query.q}
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder={m.project.searchPlaceholder}
          aria-label={m.common.search}
          className="pl-8"
        />
      </form>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <Select
          value={query.status ?? ALL}
          onValueChange={(value) => navigate({ status: value === ALL ? undefined : value })}
        >
          <SelectTrigger aria-label={m.project.fields.status} className="w-full md:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{m.common.all}</SelectItem>
            {PROJECT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {m.project.status[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={query.sort} onValueChange={(value) => navigate({ sort: value })}>
          <SelectTrigger aria-label={m.project.sort.label} className="w-full md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_SORTS.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {m.project.sort[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
