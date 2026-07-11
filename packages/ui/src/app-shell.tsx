import type { NavItem } from "@evcp/types";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavGlyph } from "./nav-icons";

function normalizeRoute(route: string): string {
  const normalized = route.replace(/\/+$/, "");
  return normalized || "/";
}

function navItemMatchesPath(item: NavItem, currentPath: string): boolean {
  const itemRoute = normalizeRoute(item.route);
  const path = normalizeRoute(currentPath);
  if (itemRoute === path) return true;
  return itemRoute !== "/" && path.startsWith(`${itemRoute}/`);
}

function resolveActiveNavItem(navItems: NavItem[], currentPath: string): NavItem | undefined {
  return [...navItems]
    .filter((item) => navItemMatchesPath(item, currentPath))
    .sort((a, b) => normalizeRoute(b.route).length - normalizeRoute(a.route).length)[0];
}

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
  tagline = "Enterprise AI Workspace",
  tone = "dark",
  children
}: {
  title: string;
  navItems: NavItem[];
  userName: string;
  environmentLabel?: string;
  session?: ReactNode;
  logo?: ReactNode;
  tagline?: string;
  tone?: "dark" | "light";
  children: ReactNode;
}) {
  const currentPath = typeof window === "undefined" ? "" : window.location.pathname;
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

  return (
    <div
      className={`app-shell ${tone === "light" ? "app-shell-light" : ""} ${isSidebarCollapsed ? "app-shell-collapsed" : ""} ${isMobileMenuOpen ? "app-shell-mobile-open" : ""}`.trim()}
    >
      <button
        type="button"
        ref={mobileTriggerRef}
        className="app-shell-mobile-trigger"
        aria-expanded={isMobileMenuOpen}
        aria-controls={sidebarId}
        aria-label="Open navigation"
        onClick={() => setIsMobileMenuOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <button
        type="button"
        className="app-shell-mobile-backdrop"
        aria-label="Close navigation"
        aria-hidden={!isMobileMenuOpen}
        tabIndex={isMobileMenuOpen ? 0 : -1}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        id={sidebarId}
        className="sidebar"
        aria-label={`${title} navigation`}
        aria-hidden={isMobileViewport && !isMobileMenuOpen ? true : undefined}
        inert={isMobileViewport && !isMobileMenuOpen ? true : undefined}
      >
        <div className="sidebar-brand">
          <span className={`sidebar-mark${logo ? " sidebar-mark-logo" : ""}`} aria-hidden="true">
            {logo ?? brandMark}
          </span>
          <div className="sidebar-title">
            <strong>{title}</strong>
            <span>{tagline}</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={handleToggleSidebar}
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span aria-hidden="true">{isSidebarCollapsed ? "›" : "‹"}</span>
          </button>
          <button
            type="button"
            ref={closeControlRef}
            className="sidebar-mobile-close"
            aria-label="Close navigation"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = normalizeRoute(item.route) === activeRoute;
            return (
              <a
                className={isActive ? "active" : undefined}
                href={item.route}
                key={item.route}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
              >
                <span className="sidebar-nav-short" aria-hidden="true">
                  <NavGlyph name={item.icon} />
                </span>
                <span className="sidebar-nav-label">{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user-avatar" aria-hidden="true">
            {userInitials}
          </span>
          <div className="sidebar-user-meta">
            <strong>{userName}</strong>
            <span>{environmentLabel}</span>
          </div>
        </div>
        {session ? <div className="sidebar-session">{session}</div> : null}
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
