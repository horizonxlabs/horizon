import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../cn";
import { nextEnabledIndex, parseSelectOptions, selectedLabel } from "./select-helpers";

// Drop-in replacement for the former native `<select>` primitive: a fully
// custom, accessible listbox built from React + Tailwind tokens only (no icon
// or headless-ui dependency — @evcp/ui stays React-only). The public API mirrors
// the props the old native control accepted so every call site keeps compiling.
//
// `onChange` is shaped `{ target: { value } }` so existing handlers that read
// `event.target.value` keep working unchanged.
//
// Limitation: native form validation is intentionally NOT replicated — `required`
// maps to `aria-required` on the trigger for AT, but there is no hidden native
// `<select>` and no browser-enforced "please select an item" on submit. The
// drawers that host these selects already surface server-side validation errors,
// so this is an accepted, documented gap.
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
  const items = useMemo(() => parseSelectOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const baseId = useId().replace(/:/g, "");
  const listboxId = `select-listbox-${baseId}`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const selectedIndex = items.findIndex((item) => item.value === value);
  const label = selectedLabel(items, value);

  // Outside-click + focus restoration, registered only while open and cleaned up
  // on close/unmount. Inlined (no external `close` ref) to keep effect deps tidy.
  useEffect(() => {
    if (!open) return undefined;
    function onDocumentMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  function closeMenu(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function openMenu() {
    if (disabled) return;
    const start =
      selectedIndex >= 0 && !items[selectedIndex]?.disabled
        ? selectedIndex
        : nextEnabledIndex(items, -1, 1);
    setActiveIndex(start);
    setOpen(true);
  }

  function commit(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    onChange?.({ target: { value: item.value } });
    closeMenu();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => nextEnabledIndex(items, current, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => nextEnabledIndex(items, current, -1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(nextEnabledIndex(items, -1, 1));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(nextEnabledIndex(items, 0, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        closeMenu(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={triggerClasses}
      >
        <span className={cn("truncate", label == null && "text-muted")}>
          {label ?? "Select…"}
        </span>
        <ChevronDown />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-auto rounded-control border border-border bg-surface py-1 shadow-card"
        >
          {items.map((item, index) => {
            const isSelected = item.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={`${item.value}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={item.disabled || undefined}
                onMouseEnter={() => {
                  if (!item.disabled) setActiveIndex(index);
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(index)}
                className={cn(
                  "flex cursor-pointer items-center px-3 py-2 text-sm text-body",
                  isActive && "bg-surface-muted",
                  isSelected && "text-primary",
                  item.disabled && "opacity-50 pointer-events-none"
                )}
              >
                {item.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
