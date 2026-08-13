import type { AppStoreItem } from "@evcp/types";

export type StoreAppCardAction = {
  kind: "open" | "detail" | "request" | "status";
  label: string;
  href?: string;
};

export function storeAppCardAction(
  app: Pick<AppStoreItem, "slug" | "accessStatus" | "health"> & { route?: string }
): StoreAppCardAction {
  if (app.accessStatus === "active" && app.health === "healthy" && app.route?.trim())
    return { kind: "open", label: "Open app", href: app.route };
  if (app.accessStatus === "pending")
    return { kind: "status", label: "View request", href: "/store/access-requests" };
  if (app.accessStatus === "available")
    return {
      kind: "request",
      label: "Request access",
      href: `/store/apps/${encodeURIComponent(app.slug)}`
    };
  return {
    kind: "detail",
    label: "View details",
    href: `/store/apps/${encodeURIComponent(app.slug)}`
  };
}

export function storeAppAccent(appSlug: string): number {
  return (
    [...appSlug].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 6
  );
}
