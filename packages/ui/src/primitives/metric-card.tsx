import type { ReactNode } from "react";
import type { Tone } from "./badge";
import { Card } from "./card";

export function MetricCard({
  label,
  value,
  hint,
  detail,
  icon
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
}) {
  const sub = hint ?? detail;
  return (
    <Card className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-2xl font-bold tracking-tight text-primary">{value}</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">{label}</div>
        </div>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}
