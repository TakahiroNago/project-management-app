"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "@/i18n";
import { cn } from "@/lib/utils";

export function ProjectTabs({ projectId, showSettings }: { projectId: string; showSettings: boolean }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: m.project.tabs.overview },
    { href: `${base}/board`, label: m.project.tabs.board },
    { href: `${base}/members`, label: m.project.tabs.members },
    ...(showSettings ? [{ href: `${base}/settings`, label: m.project.tabs.settings }] : []),
  ];

  return (
    <nav className="-mb-px flex gap-4 overflow-x-auto border-b" aria-label={m.project.tabs.label}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-1 pb-2 text-sm whitespace-nowrap transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
