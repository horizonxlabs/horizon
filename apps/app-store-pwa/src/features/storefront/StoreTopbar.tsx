import { useEffect, useState } from "react";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { Menu, Search } from "lucide-react";
import type { StoreRoute } from "@/routes/store-route";
import { parseStoreSearchQuery, storePageContext, storeSearchHref } from "./store-navigation";
import { useStoreLocationSearch } from "./use-store-location-search";

export type StoreShellAvailability =
  "loading" | "ready" | "authentication-error" | "platform-error";

export function StoreTopbar({
  route,
  source,
  availability = "ready",
  refreshPending,
  refreshError,
  onRefresh,
  navigationOpen,
  onOpenNavigation
}: {
  route: StoreRoute;
  source: "Platform API";
  availability?: StoreShellAvailability;
  refreshPending: boolean;
  refreshError?: string;
  onRefresh: () => void;
  navigationOpen: boolean;
  onOpenNavigation: () => void;
}) {
  const locationSearch = useStoreLocationSearch();
  const ready = availability === "ready";
  const pageContext = storePageContext(route);
  const [query, setQuery] = useState(() => (ready ? parseStoreSearchQuery(locationSearch) : ""));

  useEffect(() => {
    setQuery(ready ? parseStoreSearchQuery(locationSearch) : "");
  }, [locationSearch, ready]);

  const status = refreshPending
    ? { tone: "info" as const, label: source, message: "Refreshing Store…" }
    : refreshError
      ? {
          tone: "warning" as const,
          label: "Platform API warning",
          message: "Refresh failed. Previous Store data is still visible."
        }
      : availability === "loading"
        ? {
            tone: "neutral" as const,
            label: "Platform API connecting",
            message: "Connecting to Store services."
          }
        : availability === "authentication-error"
          ? {
              tone: "warning" as const,
              label: "Sign-in required",
              message: "Sign in to connect to Store services."
            }
          : availability === "platform-error"
            ? {
                tone: "danger" as const,
                label: "Platform API unavailable",
                message: "Store services are unavailable."
              }
            : { tone: "success" as const, label: source, message: "Store data is current." };

  return (
    <header className="store-topbar">
      <button
        type="button"
        className="store-navigation-trigger"
        aria-label="Open navigation"
        aria-expanded={navigationOpen}
        aria-controls="store-navigation-drawer"
        onClick={onOpenNavigation}
      >
        <Menu aria-hidden="true" />
      </button>
      <div className="store-topbar-context">
        <span>{pageContext.eyebrow}</span>
        <strong>{pageContext.title}</strong>
        <small>{pageContext.description}</small>
      </div>
      <form
        className="store-topbar-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) navigateBrowserPath(storeSearchHref(query));
        }}
      >
        <label>
          <span className="sr-only">Search applications</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            disabled={!ready}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search applications"
          />
        </label>
      </form>
      <div className="store-topbar-status">
        <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
        <span role={refreshError ? undefined : "status"}>{status.message}</span>
        {ready ? (
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
            disabled={refreshPending}
          >
            {refreshPending ? "Refreshing Store…" : "Refresh Store"}
          </button>
        ) : null}
      </div>
    </header>
  );
}
