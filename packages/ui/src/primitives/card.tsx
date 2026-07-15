import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border bg-surface", className)} {...rest} />;
}

export function SectionCard({
  title,
  actions,
  children
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-body">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}
