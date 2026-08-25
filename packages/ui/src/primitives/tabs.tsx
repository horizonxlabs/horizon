import * as RovingFocusGroup from "@radix-ui/react-roving-focus";
import type { ReactNode } from "react";
import { cn } from "../cn";

export type TabItem<T extends string> = { id: T; label: ReactNode };

// The @evcp/ui tab bar. Radix RovingFocusGroup provides WAI-ARIA keyboard
// navigation (Left/Right/Home/End, roving tabindex, looping) for the list; the
// native <button>s keep click/Enter/Space activation (manual activation, so
// arrow keys move focus without triggering a consumer's panel switch). This is a
// list-only tab bar: consumers render their panels separately from `active`.
export function Tabs<T extends string>({
  items,
  active,
  onSelect,
  variant = "underline",
  "aria-label": ariaLabel
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  variant?: "underline" | "segmented";
  "aria-label"?: string;
}) {
  return (
    <RovingFocusGroup.Root asChild orientation="horizontal" loop>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "flex max-w-full gap-1",
          variant === "segmented"
            ? "overflow-x-auto rounded-xl border border-border bg-surface-muted p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            : "flex-wrap border-b border-border"
        )}
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <RovingFocusGroup.Item asChild key={item.id} active={selected}>
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "whitespace-nowrap text-sm font-medium outline-none transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-2 focus-visible:ring-primary-soft",
                  variant === "segmented"
                    ? "rounded-lg px-3 py-1.5"
                    : "-mb-px rounded-none border-b-2 bg-transparent px-4 py-2",
                  selected
                    ? variant === "segmented"
                      ? "bg-primary-soft text-primary shadow-sm"
                      : "border-primary text-primary"
                    : variant === "segmented"
                      ? "bg-transparent text-muted hover:bg-surface hover:text-body"
                      : "border-transparent text-muted hover:text-body"
                )}
              >
                {item.label}
              </button>
            </RovingFocusGroup.Item>
          );
        })}
      </div>
    </RovingFocusGroup.Root>
  );
}
