import type { ReactNode } from "react";
import { cn } from "../cn";

export type TabItem<T extends string> = { id: T; label: ReactNode };

export function Tabs<T extends string>({
  items,
  active,
  onSelect,
  "aria-label": ariaLabel
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  "aria-label"?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1 border-b border-border">
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(item.id)}
            className={cn(
              "-mb-px border-b-2 bg-surface px-4 py-2 text-sm font-medium outline-none",
              selected ? "border-primary text-primary" : "border-transparent text-muted hover:text-body"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
