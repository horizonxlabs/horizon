import { useEffect, useRef } from "react";
import { navigateBrowserPath } from "@evcp/ui";
import { STORE_NAVIGATION_GROUPS, isStoreRouteActive } from "./store-navigation";

type StoreSidebarProps = {
  currentPath: string;
  mobileOpen: boolean;
  onNavigate: () => void;
  onClose: () => void;
  requestCount: number;
  ticketCount: number;
};

function navigationCount(
  route: string,
  requestCount: number,
  ticketCount: number
): number | undefined {
  if (route === "/store/access-requests") return requestCount || undefined;
  if (route === "/store/tickets") return ticketCount || undefined;
  return undefined;
}

function sidebarControls(sidebar: HTMLElement): HTMLElement[] {
  return [...sidebar.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
    (control) => !control.hasAttribute("hidden")
  );
}

function StoreNavigation({
  currentPath,
  requestCount,
  ticketCount,
  onNavigate
}: Omit<StoreSidebarProps, "mobileOpen" | "onClose">) {
  return (
    <nav aria-label="Horizon Store navigation">
      {STORE_NAVIGATION_GROUPS.map((group) => (
        <section key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map((item) => {
            const count = navigationCount(item.route, requestCount, ticketCount);
            return (
              <a
                key={item.route}
                href={item.route}
                aria-current={isStoreRouteActive(currentPath, item.route) ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  navigateBrowserPath(item.route);
                  onNavigate();
                }}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
                {count === undefined ? null : (
                  <span className="store-navigation-count">{count}</span>
                )}
              </a>
            );
          })}
        </section>
      ))}
    </nav>
  );
}

export function StoreSidebar({
  currentPath,
  mobileOpen,
  onNavigate,
  onClose,
  requestCount,
  ticketCount
}: StoreSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const focusFirstControl = () =>
      sidebarRef.current && sidebarControls(sidebarRef.current)[0]?.focus();
    focusFirstControl();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const controls = sidebarControls(sidebarRef.current);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      <aside id="store-sidebar" className="store-sidebar store-sidebar-desktop">
        <StoreNavigation
          currentPath={currentPath}
          requestCount={requestCount}
          ticketCount={ticketCount}
          onNavigate={onNavigate}
        />
      </aside>
      <aside
        ref={sidebarRef}
        id="store-navigation-drawer"
        className={`store-sidebar store-sidebar-drawer ${mobileOpen ? "store-sidebar-open" : ""}`}
        aria-label="Horizon Store navigation"
        aria-hidden={!mobileOpen}
        hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <button type="button" className="store-sidebar-close" onClick={onClose}>
          Close navigation
        </button>
        <StoreNavigation
          currentPath={currentPath}
          requestCount={requestCount}
          ticketCount={ticketCount}
          onNavigate={onNavigate}
        />
      </aside>
      {mobileOpen ? (
        <button className="store-drawer-backdrop" aria-label="Close navigation" onClick={onClose} />
      ) : null}
    </>
  );
}
