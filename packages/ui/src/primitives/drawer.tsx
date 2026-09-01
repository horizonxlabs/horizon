import type { ReactNode, RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../cn";

export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
  returnFocusRef,
  initialFocusRef
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Panel width. Defaults to "md" (the historical width); "lg"/"xl" give content like editors room. */
  size?: "md" | "lg" | "xl";
  /** Focus target outside a controlled drawer when it closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Preferred field to focus when the drawer opens. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const widthClass = size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Radix drives every dismissal (Escape, overlay click, the × close button); map
        // "closing" back to the caller's onClose. Callers own the `open` prop, so we never
        // request opening here.
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.4)]" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (!returnFocusRef?.current) return;
            event.preventDefault();
            returnFocusRef.current.focus();
          }}
          // Radix auto-wires aria-labelledby -> Dialog.Title, and aria-describedby ->
          // Dialog.Description when one is present. When there is no description, pass
          // aria-describedby={undefined} to opt out of Radix's dev-only "missing
          // Description" warning. (Spread so we add the prop ONLY in the no-description
          // case — passing it unconditionally would clobber Radix's auto-wiring.)
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "border-border bg-surface shadow-card fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l outline-none",
            widthClass
          )}
        >
          <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-body text-base font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-muted text-sm">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close panel"
              className="rounded-control text-muted hover:bg-surface-muted min-h-11 min-w-11 bg-transparent px-2 py-1 text-lg leading-none"
            >
              ×
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="border-border border-t px-5 py-4">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
