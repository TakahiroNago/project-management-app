import { AlertTriangle } from "lucide-react";
import { m } from "@/i18n";
import { cn } from "@/lib/utils";
import type { DashboardData } from "../queries";

const numberFormatter = new Intl.NumberFormat("ja-JP");

/** KPI の数値タイル。値は文字色（本文色）で表示し、警告は色だけでなくアイコンでも示す */
export function StatTiles({ stats }: { stats: DashboardData["stats"] }) {
  const tiles = [
    { key: "totalProjects", label: m.dashboard.stats.totalProjects, value: stats.totalProjects },
    { key: "inProgressProjects", label: m.dashboard.stats.inProgressProjects, value: stats.inProgressProjects },
    { key: "completedProjects", label: m.dashboard.stats.completedProjects, value: stats.completedProjects },
    { key: "openTasks", label: m.dashboard.stats.openTasks, value: stats.openTasks },
    {
      key: "overdueTasks",
      label: m.dashboard.stats.overdueTasks,
      value: stats.overdueTasks,
      warning: stats.overdueTasks > 0,
    },
  ];

  return (
    <dl
      aria-label={m.dashboard.stats.label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-testid={`stat-${tile.key}`}
          className={cn(
            "rounded-xl border bg-card p-4",
            tile.warning && "border-destructive/40 bg-destructive/5",
          )}
        >
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {tile.warning && <AlertTriangle className="size-3.5 text-destructive" aria-hidden />}
            {tile.label}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{numberFormatter.format(tile.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
