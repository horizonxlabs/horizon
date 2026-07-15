import type { ReactNode } from "react";
import { cn } from "../cn";
import type { Tone } from "./badge";
import { Card } from "./card";

// The value (big number) is colored by tone to convey status, mirroring the legacy
// MetricCard semantics. Neutral (and the default) stays the primary brand color.
const TONE_VALUE_CLASS: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-primary"
};

export function MetricCard({
  label,
  value,
  hint,
  detail,
  icon,
  tone = "neutral"
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
          <div className={cn("text-2xl font-bold tracking-tight", TONE_VALUE_CLASS[tone])}>
            {value}
          </div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">{label}</div>
        </div>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}
