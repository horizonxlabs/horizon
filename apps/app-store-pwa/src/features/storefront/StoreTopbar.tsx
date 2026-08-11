import { useEffect, useState } from "react";
import type { PlatformRole } from "@evcp/types";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { Menu, Search } from "lucide-react";
import type { StoreRoute } from "@/routes/store-route";
import { parseStoreSearchQuery, storeSearchHref } from "./store-navigation";

function currentSearchQuery(): string {
  return typeof window === "undefined" ? "" : parseStoreSearchQuery(window.location.search ?? "");
}

export function StoreTopbar({
  route,
  userName,
  email,
  role,
  source,
  refreshPending,
  refreshError,
  onRefresh,
  navigationOpen,
  onOpenNavigation,
  onLogout
}: {
  route: StoreRoute;
  userName?: string;
  email?: string;
  role?: PlatformRole;
  source: "Platform API";
  refreshPending: boolean;
  refreshError?: string;
  onRefresh: () => void;
  navigationOpen: boolean;
  onOpenNavigation: () => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState(currentSearchQuery);

  useEffect(() => {
    setQuery(currentSearchQuery());
  }, [route]);

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
      <form
        className="store-topbar-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          navigateBrowserPath(storeSearchHref(query));
        }}
      >
        <label>
          <span className="sr-only">Search applications</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search applications"
          />
        </label>
      </form>
      <div className="store-topbar-status">
        <ToneBadge tone="success">{source}</ToneBadge>
        <span role="status">
          {refreshPending
            ? "Refreshing Store…"
            : refreshError
              ? "Refresh failed. Previous Store data is still visible."
              : "Store data is current."}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={onRefresh}
          disabled={refreshPending}
        >
          {refreshPending ? "Refreshing Store…" : "Refresh Store"}
        </button>
      </div>
      <div className="store-topbar-identity">
        <span>{userName ?? "Loading account…"}</span>
        {email ? <small>{email}</small> : null}
        {role ? <ToneBadge tone="neutral">{role.replace("_", " ")}</ToneBadge> : null}
        <button type="button" className="secondary-button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
