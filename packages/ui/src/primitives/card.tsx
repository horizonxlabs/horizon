import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border bg-surface", className)} {...rest} />;
}

export function SectionCard({
  eyebrow,
  title,
  action,
  actions,
  children,
  className
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headerActions = actions ?? action;
  return (
    <Card className={className}>
      {(title || eyebrow || headerActions) && (
        <div className="flex items-start justify-between border-b border-border-soft px-4 py-3">
          <div>
            {eyebrow && (
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</span>
            )}
            {title && <h2 className="text-sm font-semibold text-body">{title}</h2>}
          </div>
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}
