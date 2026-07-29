export type StoreRoute =
  | { page: "my-apps" | "available" | "search" | "favorites" | "recent" | "access-requests" | "tickets" | "profile" }
  | { page: "app-detail"; appSlug: string }
  | { page: "ticket-detail"; ticketId: string }
  | { page: "not-found" };

const collectionRoutes: Record<string, Exclude<StoreRoute, { page: "app-detail" | "ticket-detail" | "not-found" }>> = {
  "/store": { page: "my-apps" },
  "/store/": { page: "my-apps" },
  "/store/available": { page: "available" },
  "/store/search": { page: "search" },
  "/store/favorites": { page: "favorites" },
  "/store/recent": { page: "recent" },
  "/store/access-requests": { page: "access-requests" },
  "/store/tickets": { page: "tickets" },
  "/store/profile": { page: "profile" }
};

function decodeSegment(segment: string): string | undefined {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function storeRouteFromPath(pathname: string): StoreRoute {
  const collection = collectionRoutes[pathname];
  if (collection) return collection;

  const segments = pathname.split("/");
  if (segments.length !== 4 || segments[0] !== "" || segments[1] !== "store") {
    return { page: "not-found" };
  }

  const parameter = decodeSegment(segments[3]);
  if (!parameter) return { page: "not-found" };
  if (segments[2] === "apps") return { page: "app-detail", appSlug: parameter };
  if (segments[2] === "tickets") return { page: "ticket-detail", ticketId: parameter };
  return { page: "not-found" };
}
