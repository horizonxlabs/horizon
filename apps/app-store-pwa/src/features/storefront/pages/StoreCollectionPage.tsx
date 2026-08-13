import type { AppStoreItem } from "@evcp/types";
import { navigateBrowserPath } from "@evcp/ui";
import { useState } from "react";
import { selectStoreCollection } from "../catalog";
import { StoreAppCard } from "../StoreAppCard";
import { StorePageHeader } from "../StorePageHeader";
import { useStorefront } from "../StoreProvider";
import { StoreStatePanel } from "../StoreStatePanel";

export type StoreCollectionPageName = "my-apps" | "available" | "favorites" | "recent";

export function navigateToStoreApp(appSlug: string): void {
  navigateBrowserPath(`/store/apps/${encodeURIComponent(appSlug)}`);
}

const PAGE_COPY: Record<
  StoreCollectionPageName,
  { title: string; eyebrow: string; empty: string }
> = {
  "my-apps": {
    title: "My Apps",
    eyebrow: "Platform API access",
    empty: "No applications are currently assigned to your account."
  },
  available: {
    title: "Available Apps",
    eyebrow: "Platform API catalog",
    empty: "No other applications are currently available to request."
  },
  favorites: {
    title: "Favorites",
    eyebrow: "Device-local preferences",
    empty: "Save an app as a favorite on this device to find it here."
  },
  recent: {
    title: "Recently opened",
    eyebrow: "Device-local history",
    empty: "Open an application from its detail page to build this device's recent history."
  }
};

export function appsForCollection(
  page: StoreCollectionPageName,
  apps: { myApps: AppStoreItem[]; availableApps: AppStoreItem[]; allApps: AppStoreItem[] },
  favorites: string[],
  recent: string[]
): AppStoreItem[] {
  return selectStoreCollection(page, apps, page === "recent" ? recent : favorites);
}

export function StoreAppList({ apps }: { apps: AppStoreItem[] }) {
  if (!apps.length) return null;
  return (
    <div className="store-app-grid">
      {apps.map((app) => (
        <StoreAppCard key={app.id} app={app} />
      ))}
    </div>
  );
}

function storeCollectionLink(href: string, label: string) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigateBrowserPath(href);
      }}
    >
      {label}
    </a>
  );
}

export function StoreCollectionPage({ page }: { page: StoreCollectionPageName }) {
  const { allApps, bootstrap, device, refreshHome } = useStorefront();
  const [emptyRefreshPending, setEmptyRefreshPending] = useState(false);
  const [emptyRefreshError, setEmptyRefreshError] = useState<string>();
  const copy = PAGE_COPY[page];
  const apps = appsForCollection(
    page,
    { myApps: bootstrap.myApps, availableApps: bootstrap.availableApps, allApps },
    device.favorites,
    device.recent
  );
  const isEmptyCatalog = allApps.length === 0;
  const canPublish = bootstrap.role === "creator" || bootstrap.role === "admin";
  const deviceLocal = page === "favorites" || page === "recent";
  async function refreshEmptyCatalog() {
    setEmptyRefreshPending(true);
    setEmptyRefreshError(undefined);
    const result = await refreshHome({ preserveReadyOnFailure: true });
    if (!result.ok) setEmptyRefreshError(result.error.message);
    setEmptyRefreshPending(false);
  }
  const emptyAction =
    isEmptyCatalog && canPublish ? (
      <button type="button" onClick={() => window.location.assign("/creator/")}>
        Open Creator Workspace
      </button>
    ) : isEmptyCatalog ? (
      <button
        type="button"
        onClick={() => void refreshEmptyCatalog()}
        disabled={emptyRefreshPending}
      >
        {emptyRefreshPending ? "Refreshing Store…" : "Refresh Store"}
      </button>
    ) : page === "my-apps" && allApps.some((app) => app.accessStatus !== "active") ? (
      storeCollectionLink("/store/available", "Browse Available Apps")
    ) : page === "favorites" ? (
      storeCollectionLink("/store/available", "Browse Available Apps")
    ) : page === "recent" || page === "available" ? (
      storeCollectionLink("/store/", "View My Apps")
    ) : undefined;

  const emptyTitle =
    isEmptyCatalog && canPublish
      ? "No apps published yet"
      : page === "my-apps" && allApps.some((app) => app.accessStatus !== "active")
        ? "No apps with access yet"
        : `No ${copy.title.toLocaleLowerCase()} yet`;
  const emptyDescription =
    isEmptyCatalog && canPublish
      ? "The Store is ready. Publish a project from Creator Workspace to make its governed app available here."
      : page === "my-apps" && allApps.some((app) => app.accessStatus !== "active")
        ? "Browse the catalog and request access to an available app."
        : copy.empty;

  return (
    <section className="store-page">
      <StorePageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        count={apps.length}
        deviceLocal={deviceLocal}
      />
      {apps.length ? (
        <StoreAppList apps={apps} />
      ) : (
        <StoreStatePanel
          eyebrow={isEmptyCatalog && canPublish ? "App Store catalog" : copy.eyebrow}
          title={emptyTitle}
          action={emptyAction}
        >
          <p>{emptyDescription}</p>
          {emptyRefreshError ? (
            <p className="store-action-error" role="alert">
              {emptyRefreshError}
            </p>
          ) : null}
        </StoreStatePanel>
      )}
    </section>
  );
}
