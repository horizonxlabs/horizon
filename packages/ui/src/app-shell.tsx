import type { NavItem } from "@evcp/types";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavGlyph } from "./nav-icons";
import { cn } from "./cn";
import { isPlainLeftClick, normalizeRoute, resolveActiveNavItem } from "./app-shell-nav";

export { isPlainLeftClick } from "./app-shell-nav";

function createInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "EV";
  if (words[0] === words[0].toUpperCase() && words[0].length > 1) return words[0].slice(0, 2);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function AppShell({
  title,
  navItems,
  userName,
  environmentLabel = "Private Server MVP",
  session,
  logo,
  sidebarContext,
  tagline = "Enterprise AI Workspace",
  tone = "dark",
  onNavigate,
  currentPath = typeof window === "undefined" ? "" : window.location.pathname,
  children
}: {
  title: string;
  navItems: NavItem[];
  userName: string;
  environmentLabel?: string;
  session?: ReactNode;
  logo?: ReactNode;
  sidebarContext?: ReactNode;
  tagline?: string;
  tone?: "dark" | "light";
  onNavigate?: (route: string) => void;
  currentPath?: string;
  children: ReactNode;
}) {
  const activeNavItem = resolveActiveNavItem(navItems, currentPath) ?? navItems[0];
  const activeRoute = activeNavItem ? normalizeRoute(activeNavItem.route) : "";
  const brandMark = createInitials(title);
  const userInitials = createInitials(userName);
  const sidebarId = `app-shell-sidebar-${useId().replace(/:/g, "")}`;
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const closeControlRef = useRef<HTMLButtonElement>(null);
  const wasMobileMenuOpenRef = useRef(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("evcp-sidebar-collapsed") === "true";
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    function handleViewportChange() {
      setIsMobileViewport(media.matches);
      if (!media.matches) setIsMobileMenuOpen(false);
    }

    handleViewportChange();
    media.addEventListener("change", handleViewportChange);
    return () => media.removeEventListener("change", handleViewportChange);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) closeControlRef.current?.focus();
    else if (isMobileViewport && wasMobileMenuOpenRef.current) mobileTriggerRef.current?.focus();
    wasMobileMenuOpenRef.current = isMobileMenuOpen;
  }, [isMobileMenuOpen, isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || !isMobileMenuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen, isMobileViewport]);

  function handleToggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined")
        window.localStorage.setItem("evcp-sidebar-collapsed", String(next));
      return next;
    });
  }

  const isLight = tone === "light";
  const collapsed = isSidebarCollapsed;

  return (
    <div
      className={cn(
        "text-body min-h-screen [background:linear-gradient(180deg,rgba(219,234,254,0.42),rgba(238,243,248,0)_260px),var(--evcp-color-page)]",
        "max-md:min-w-0 max-md:overflow-x-hidden md:grid md:transition-[grid-template-columns] md:duration-200",
        collapsed && "app-shell-collapsed",
        collapsed ? "md:grid-cols-[84px_minmax(0,1fr)]" : "md:grid-cols-[280px_minmax(0,1fr)]"
      )}
    >
      <button
        type="button"
        ref={mobileTriggerRef}
        className={cn(
          "focus-visible:outline-primary hidden focus-visible:outline-2 focus-visible:outline-offset-2",
          "max-md:rounded-control max-md:border-border max-md:bg-surface max-md:text-body max-md:shadow-card max-md:fixed max-md:top-4 max-md:left-4 max-md:z-30 max-md:inline-flex max-md:h-[42px] max-md:w-[42px] max-md:items-center max-md:justify-center max-md:border"
        )}
        aria-expanded={isMobileMenuOpen}
        aria-controls={sidebarId}
        aria-label="Open navigation"
        onClick={() => setIsMobileMenuOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <button
        type="button"
        className={cn(
          "hidden border-0 p-0",
          isMobileMenuOpen &&
            "max-md:fixed max-md:inset-0 max-md:z-40 max-md:block max-md:bg-[rgba(15,23,42,0.32)]"
        )}
        aria-label="Close navigation"
        aria-hidden={!isMobileMenuOpen}
        tabIndex={isMobileMenuOpen ? 0 : -1}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        id={sidebarId}
        className={cn(
          "sticky top-0 box-border flex h-screen flex-col gap-4 border-r",
          collapsed ? "px-3 py-4" : "px-[14px] py-[18px]",
          isLight
            ? "border-border bg-surface text-body"
            : "border-[rgba(148,163,184,0.1)] bg-[#0b1220] text-[#e2e8f0]",
          "max-md:border-border max-md:shadow-card max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[42] max-md:h-[100dvh] max-md:w-[min(86vw,320px)] max-md:max-w-[320px] max-md:overflow-y-auto max-md:border-r max-md:transition-transform max-md:duration-200",
          isMobileMenuOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
        aria-label={`${title} navigation`}
        aria-hidden={isMobileViewport && !isMobileMenuOpen ? true : undefined}
        inert={isMobileViewport && !isMobileMenuOpen ? true : undefined}
      >
        {/* Brand header */}
        <div
          className={cn(
            "flex items-center gap-[10px] px-1",
            logo ? (sidebarContext ? "pt-1.5 pb-1" : "pt-1.5 pb-[18px]") : "pt-1 pb-4",
            collapsed &&
              (sidebarContext
                ? "flex-col items-center gap-2 pb-1"
                : "flex-col items-center gap-2 pb-4"),
            "max-md:!flex-row max-md:!items-center max-md:!pb-4"
          )}
        >
          <span
            className={cn(
              "flex-none items-center",
              logo
                ? "flex h-[44px] w-auto justify-start rounded-none border-0 bg-none"
                : "inline-flex h-[38px] w-[38px] justify-center rounded-[10px] bg-[linear-gradient(135deg,#2563eb,#38bdf8)] text-[13px] font-extrabold tracking-[0.01em] text-white",
              collapsed && logo && "w-[38px] justify-center overflow-hidden"
            )}
            aria-hidden="true"
          >
            {logo ?? brandMark}
          </span>
          {logo ? null : (
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-px",
                collapsed && "hidden",
                "max-md:!flex max-md:!flex-col"
              )}
            >
              <strong
                className={cn(
                  "block overflow-hidden text-[14px] leading-[1.2] font-bold tracking-[-0.01em] text-ellipsis whitespace-nowrap",
                  isLight ? "text-body" : "text-[#f8fafc]"
                )}
              >
                {title}
              </strong>
              <span className="text-muted text-[11px] leading-[1.3]">{tagline}</span>
            </div>
          )}
          <button
            type="button"
            className={cn(
              "rounded-control ml-auto inline-flex h-[30px] min-h-[30px] flex-none items-center justify-center p-0 transition-colors max-md:hidden",
              collapsed ? "ml-0 w-10" : "w-[30px]",
              isLight
                ? "border-border bg-surface-muted text-muted hover:border-primary hover:bg-primary-soft hover:text-primary-strong border"
                : "border border-[rgba(226,232,240,0.1)] bg-transparent text-[#94a3b8] hover:border-[rgba(226,232,240,0.2)] hover:bg-white/[0.06] hover:text-[#f8fafc]"
            )}
            onClick={handleToggleSidebar}
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="text-[20px] leading-none" aria-hidden="true">
              {isSidebarCollapsed ? "›" : "‹"}
            </span>
          </button>
          <button
            type="button"
            ref={closeControlRef}
            className={cn(
              "focus-visible:outline-primary hidden focus-visible:outline-2 focus-visible:outline-offset-2",
              "max-md:rounded-control max-md:border-border max-md:bg-surface-muted max-md:text-muted max-md:ml-auto max-md:inline-flex max-md:h-[30px] max-md:w-[30px] max-md:flex-none max-md:items-center max-md:justify-center max-md:border max-md:text-[20px]"
            )}
            aria-label="Close navigation"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {sidebarContext ? <div className="app-shell-sidebar-context">{sidebarContext}</div> : null}

        {/* Primary navigation */}
        <nav className={cn("flex flex-col gap-0.5", collapsed && "gap-1")} aria-label="Primary">
          {navItems.map((item) => {
            const isActive = normalizeRoute(item.route) === activeRoute;
            const iconClass = cn(
              "inline-flex h-5 w-5 flex-none items-center justify-center",
              isActive && (isLight ? "text-primary" : "text-[#56c5f8]")
            );
            const content = (
              <>
                <span className={iconClass} aria-hidden="true">
                  <NavGlyph name={item.icon} />
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
                    collapsed && "hidden",
                    "max-md:!block"
                  )}
                >
                  {item.label}
                </span>
              </>
            );
            const base = cn(
              "relative flex min-h-[40px] items-center gap-[11px] rounded-[9px] px-[11px] text-[13.5px] font-semibold no-underline transition-colors",
              "before:absolute before:left-[-14px] before:top-1/2 before:h-[18px] before:w-[3px] before:-translate-y-1/2 before:rounded-[0_3px_3px_0] before:opacity-0 before:transition-opacity before:content-['']",
              isLight ? "before:bg-primary" : "before:bg-accent",
              collapsed &&
                "min-h-[44px] justify-center gap-0 px-0 before:left-[-12px] max-md:!justify-start max-md:!gap-[11px] max-md:!px-[11px]"
            );
            if (item.disabled) {
              return (
                <span
                  className={cn(
                    base,
                    "cursor-not-allowed opacity-[0.42]",
                    isLight ? "text-muted" : "text-[#93a2b8]"
                  )}
                  key={item.route}
                  aria-disabled="true"
                  title={item.disabledReason ?? item.label}
                >
                  {content}
                </span>
              );
            }
            return (
              <a
                className={cn(
                  base,
                  isLight
                    ? "text-muted hover:bg-surface-muted hover:text-body"
                    : "text-[#93a2b8] hover:bg-white/[0.05] hover:text-[#e6edf7]",
                  isActive &&
                    "font-bold before:opacity-100 " +
                      (isLight
                        ? "bg-primary-soft text-primary-strong"
                        : "bg-[rgba(56,189,248,0.12)] text-[#f8fafc]")
                )}
                href={item.route}
                key={item.route}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
                onClick={(event) => {
                  if (onNavigate && isPlainLeftClick(event)) {
                    event.preventDefault();
                    onNavigate(item.route);
                  }
                }}
              >
                {content}
              </a>
            );
          })}
        </nav>

        {/* User / session footer */}
        <div
          className={cn(
            "mt-auto flex flex-col gap-[10px] rounded-[12px] border p-[10px]",
            collapsed
              ? cn(
                  "gap-0 border-transparent bg-transparent p-0",
                  "max-md:!gap-[10px] max-md:!p-[10px]",
                  isLight
                    ? "max-md:!border-border max-md:!bg-surface-muted"
                    : "max-md:!border-[rgba(148,163,184,0.14)] max-md:!bg-[#131a2b]"
                )
              : isLight
                ? "border-border bg-surface-muted"
                : "border-[rgba(148,163,184,0.14)] bg-[#131a2b]"
          )}
        >
          <div
            className={cn(
              "text-muted flex items-center gap-[10px]",
              collapsed && "justify-center px-1.5 pt-3 pb-1"
            )}
          >
            <span
              className={cn(
                "relative inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#2563eb,#38bdf8)] text-[12.5px] font-bold tracking-[0.01em] text-white shadow-[0_1px_3px_rgba(15,23,42,0.25)]",
                "after:absolute after:-right-px after:-bottom-px after:h-2.5 after:w-2.5 after:rounded-full after:border-2 after:bg-[#22c55e] after:content-['']",
                isLight ? "after:border-surface-muted" : "after:border-[#131a2b]"
              )}
              data-status="online"
              aria-hidden="true"
            >
              {userInitials}
            </span>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-0.5",
                collapsed && "hidden",
                "max-md:!flex max-md:!flex-col"
              )}
            >
              <strong
                className={cn(
                  "min-w-0 overflow-hidden text-[13.5px] leading-[1.2] font-semibold text-ellipsis whitespace-nowrap",
                  isLight ? "text-body" : "text-[#e6edf7]"
                )}
              >
                {userName}
              </strong>
              <span className="text-muted text-[11px] leading-[1.3]">{environmentLabel}</span>
            </div>
          </div>
          {session ? (
            <div
              className={cn(
                "flex items-center gap-1.5 [&_:is(button,a)]:flex-1 [&_:is(button,a)]:justify-center [&_:is(button,a)]:text-[12px] [&_:is(button,a)]:font-semibold",
                collapsed && "hidden",
                "max-md:!flex"
              )}
            >
              {session}
            </div>
          ) : null}
        </div>
      </aside>
      <main className="box-border min-w-0 px-[clamp(20px,3vw,42px)] pt-6 pb-11 has-[.ag-workspace]:pb-0 max-md:pt-[72px]">
        {children}
      </main>
    </div>
  );
}
