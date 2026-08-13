import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Clock3,
  Compass,
  Heart,
  LayoutGrid,
  Search,
  ShieldCheck,
  Ticket,
  UserRound
} from "lucide-react";
import type { StoreRoute } from "@/routes/store-route";

export type StoreNavigationItem = {
  label: string;
  route: string;
  icon: ComponentType<LucideProps>;
};

export type StoreNavigationGroup = {
  label: "Workspace" | "Service" | "Account";
  items: StoreNavigationItem[];
};

export type StorePageContext = { eyebrow: string; title: string; description: string };

export const STORE_NAVIGATION_GROUPS: StoreNavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "My Apps", route: "/store/", icon: LayoutGrid },
      { label: "Discover", route: "/store/available", icon: Compass },
      { label: "Search", route: "/store/search", icon: Search },
      { label: "Favorites", route: "/store/favorites", icon: Heart },
      { label: "Recent", route: "/store/recent", icon: Clock3 }
    ]
  },
  {
    label: "Service",
    items: [
      { label: "Access Requests", route: "/store/access-requests", icon: ShieldCheck },
      { label: "Tickets", route: "/store/tickets", icon: Ticket }
    ]
  },
  { label: "Account", items: [{ label: "Profile", route: "/store/profile", icon: UserRound }] }
];

const PAGE_CONTEXT: Record<
  Exclude<StoreRoute["page"], "app-detail" | "ticket-detail" | "not-found">,
  StorePageContext
> = {
  "my-apps": {
    eyebrow: "Workspace",
    title: "My Apps",
    description: "Launch applications assigned to your account."
  },
  available: {
    eyebrow: "Catalog",
    title: "Discover",
    description: "Explore governed applications available to your organization."
  },
  search: {
    eyebrow: "Catalog",
    title: "Search",
    description: "Find applications by name, owner, team, or role."
  },
  favorites: {
    eyebrow: "This device",
    title: "Favorites",
    description: "Return to applications saved on this device."
  },
  recent: {
    eyebrow: "This device",
    title: "Recent",
    description: "Continue from applications opened on this device."
  },
  "access-requests": {
    eyebrow: "Service",
    title: "Access Requests",
    description: "Review request receipts remembered on this device."
  },
  tickets: {
    eyebrow: "Service",
    title: "Tickets",
    description: "Track support tickets remembered on this device."
  },
  profile: {
    eyebrow: "Account",
    title: "Profile",
    description: "Review identity and device-local Store data."
  }
};

export function storeCurrentPath(route: StoreRoute): string {
  if (route.page === "my-apps") return "/store/";
  if (route.page === "app-detail") return "/store/available";
  if (route.page === "ticket-detail") return "/store/tickets";
  if (route.page === "not-found") return "";
  return `/store/${route.page}`;
}

export function storePageContext(route: StoreRoute): StorePageContext {
  if (route.page === "app-detail") {
    return {
      eyebrow: "Application",
      title: "App Details",
      description: "Review access and support options."
    };
  }
  if (route.page === "ticket-detail") {
    return {
      eyebrow: "Support",
      title: "Ticket Details",
      description: "Review current Platform API ticket evidence."
    };
  }
  if (route.page === "not-found") {
    return {
      eyebrow: "Horizon Store",
      title: "Page Not Found",
      description: "Return to your application workspace."
    };
  }
  return PAGE_CONTEXT[route.page];
}

function normalizePath(value: string): string {
  return value.replace(/\/+$/, "") || "/";
}

export function isStoreRouteActive(currentPath: string, itemRoute: string): boolean {
  const current = normalizePath(currentPath);
  const item = normalizePath(itemRoute);
  return current === item || (item !== "/store" && current.startsWith(`${item}/`));
}

export function parseStoreSearchQuery(search: string): string {
  return new URLSearchParams(search).get("q")?.trim() ?? "";
}

export function storeSearchHref(query: string): string {
  const normalized = query.trim();
  return normalized ? `/store/search?q=${encodeURIComponent(normalized)}` : "/store/search";
}
