"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Enterprise app chrome: dark sidebar (Linear-style — panels separate via subtle borders),
// light content area, responsive mobile drawer. Compose nav items as children of `nav`:
//   <AppShell brand={<span>โลจิสติกส์</span>} nav={<><AppShellNavItem active …/>…</>}>…
export function AppShell({
  brand,
  nav,
  footer,
  headerActions,
  title,
  children
}: {
  brand: React.ReactNode;
  nav: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const sidebar = (
    <div className="flex h-full flex-col gap-4 bg-surface-dark p-4 text-slate-300">
      <div className="flex items-center gap-2 px-2 text-sm font-semibold tracking-tight text-white">
        {brand}
      </div>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {nav}
      </nav>
      {footer && <div className="border-t border-surface-dark-border pt-3">{footer}</div>}
    </div>
  );
  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900">
      <aside className="hidden w-60 shrink-0 border-r border-surface-dark-border lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          {title && <h1 className="text-sm font-semibold tracking-tight">{title}</h1>}
          <div className="ml-auto flex items-center gap-2">{headerActions}</div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

export function AppShellNavItem({
  href,
  active,
  icon,
  children
}: {
  href: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4",
        active
          ? "bg-surface-dark-raised text-white"
          : "text-slate-400 hover:bg-surface-dark-raised/60 hover:text-slate-200"
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </a>
  );
}
