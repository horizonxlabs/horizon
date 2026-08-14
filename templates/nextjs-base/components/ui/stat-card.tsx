import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

// KPI tile for dashboards: big tabular number, optional trend delta and CSS sparkline.
export function StatCard({
  label,
  value,
  delta,
  deltaDirection,
  hint,
  sparkline,
  icon,
  className
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  hint?: string;
  sparkline?: number[];
  icon?: React.ReactNode;
  className?: string;
}) {
  const max = sparkline?.length ? Math.max(...sparkline, 1) : 1;
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</span>
          {icon && <span className="text-slate-400 [&_svg]:size-4">{icon}</span>}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-xs font-medium tabular-nums",
                deltaDirection === "down" ? "bg-danger-100 text-danger-700" : "bg-success-100 text-success-700"
              )}
            >
              {deltaDirection === "down" ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
              {delta}
            </span>
          )}
        </div>
        {sparkline && sparkline.length > 1 && (
          <div className="flex h-8 items-end gap-0.5" aria-hidden="true">
            {sparkline.map((point, index) => (
              <div
                key={index}
                className={cn(
                  "flex-1 rounded-sm bg-brand-200",
                  index === sparkline.length - 1 && "bg-brand-600"
                )}
                style={{ height: `${Math.max(8, (point / max) * 100)}%` }}
              />
            ))}
          </div>
        )}
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </CardContent>
    </Card>
  );
}
