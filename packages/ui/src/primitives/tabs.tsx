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
  "aria-label": ariaLabel
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  "aria-label"?: string;
}) {
  return (
    <RovingFocusGroup.Root asChild orientation="horizontal" loop>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-1 border-b border-border"
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
                  "-mb-px rounded-none border-b-2 bg-transparent px-4 py-2 text-sm font-medium outline-none",
                  selected ? "border-primary text-primary" : "border-transparent text-muted hover:text-body"
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
