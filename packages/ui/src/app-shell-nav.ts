import type { NavItem } from "@evcp/types";

export function normalizeRoute(route: string): string {
  const normalized = route.replace(/\/+$/, "");
  return normalized || "/";
}

export function navItemMatchesPath(item: NavItem, currentPath: string): boolean {
  const itemRoute = normalizeRoute(item.route);
  const path = normalizeRoute(currentPath);
  if (itemRoute === path) return true;
  return itemRoute !== "/" && path.startsWith(`${itemRoute}/`);
}

export function resolveActiveNavItem(navItems: NavItem[], currentPath: string): NavItem | undefined {
  return [...navItems]
    .filter((item) => navItemMatchesPath(item, currentPath))
    .sort((a, b) => normalizeRoute(b.route).length - normalizeRoute(a.route).length)[0];
}

export function isPlainLeftClick(event: {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}
