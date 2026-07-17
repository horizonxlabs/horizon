import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../cn";

export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Panel width. Defaults to "md" (the historical width); "lg"/"xl" give content like editors room. */
  size?: "md" | "lg" | "xl";
}) {
  const widthClass = size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-md";
  const titleId = `drawer-title-${useId().replace(/:/g, "")}`;
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close control and lock body scroll only when the drawer opens. Keeping this off the
  // `onClose` dependency is essential: callers pass an inline `onClose` that is a new function every
  // render, so including it would re-run this effect on every keystroke and steal focus back from
  // whatever field the user is typing in (an unclosable/untypeable drawer).
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Escape-to-close is registered separately so it can track the latest `onClose` without refocusing.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-[rgba(15,23,42,0.4)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex h-full w-full flex-col border-l border-border bg-surface shadow-card",
          widthClass
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-base font-semibold text-body">
              {title}
            </h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            ref={closeRef}
            aria-label="Close panel"
            className="rounded-control bg-transparent px-2 py-1 text-lg leading-none text-muted hover:bg-surface-muted"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-border px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
