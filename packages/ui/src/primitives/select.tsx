import * as RadixSelect from "@radix-ui/react-select";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { parseSelectOptions } from "./select-helpers";

// @evcp/ui Select, backed by @radix-ui/react-select for robust accessibility
// (keyboard nav, typeahead, focus, positioning, screen-reader, form submission).
// The public API mirrors the former native <select> so every call site keeps
// compiling: children are <option> elements, and onChange is shaped
// { target: { value } } so handlers reading event.target.value keep working.
export type SelectProps = {
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  children?: ReactNode;
  id?: string;
  name?: string;
  "aria-label"?: string;
};

const triggerClasses =
  "h-10 w-full inline-flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:opacity-50 disabled:pointer-events-none";

function ChevronDown() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Select({
  value,
  onChange,
  disabled = false,
  required = false,
  className,
  children,
  id,
  name,
  "aria-label": ariaLabel
}: SelectProps) {
  const items = parseSelectOptions(children);
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(next) => onChange?.({ target: { value: next } })}
      disabled={disabled}
      required={required}
      name={name}
    >
      <RadixSelect.Trigger id={id} aria-label={ariaLabel} className={cn(triggerClasses, className)}>
        <RadixSelect.Value placeholder="Select…" />
        <RadixSelect.Icon asChild>
          <ChevronDown />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-border bg-surface py-1 shadow-card"
        >
          <RadixSelect.Viewport>
            {items.map((item, index) => (
              <RadixSelect.Item
                key={`${item.value}-${index}`}
                value={item.value}
                disabled={item.disabled}
                className={cn(
                  "flex cursor-pointer select-none items-center px-3 py-2 text-sm text-body outline-none",
                  "data-[highlighted]:bg-surface-muted data-[state=checked]:text-primary",
                  "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                )}
              >
                <RadixSelect.ItemText>{item.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
