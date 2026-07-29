import type { AppStoreItem } from "@evcp/types";
import { navigateBrowserPath, SectionCard, ToneBadge } from "@evcp/ui";
import { Heart, MonitorSmartphone } from "lucide-react";
import { selectStoreCollection } from "../catalog";
import { useStorefront } from "../StoreProvider";

export type StoreCollectionPageName = "my-apps" | "available" | "favorites" | "recent";

export function navigateToStoreApp(appSlug: string): void {
  navigateBrowserPath(`/store/apps/${encodeURIComponent(appSlug)}`);
}

const PAGE_COPY: Record<StoreCollectionPageName, { title: string; eyebrow: string; empty: string }> = {
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
    title: "Recently viewed",
    eyebrow: "Device-local history",
    empty: "View an application's details to build this device's recent history."
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
  const { device, recordRecent, toggleFavorite } = useStorefront();
  if (!apps.length) return null;
  return (
    <div className="store-app-list">
      {apps.map((app) => {
        const isFavorite = device.favorites.includes(app.slug);
        return (
          <article key={app.id} className="store-collection-card">
            <button
              type="button"
              className="store-collection-main"
              onClick={() => {
                recordRecent(app.slug);
                navigateToStoreApp(app.slug);
              }}
            >
              <span className="store-app-icon" aria-hidden="true">{app.name.slice(0, 1)}</span>
              <span>
                <strong>{app.name}</strong>
                <small>{app.description}</small>
                <em>{app.myRole ? `Role: ${app.myRole}` : "Access required"}</em>
              </span>
              <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
                {app.accessStatus === "active" ? "active" : app.accessStatus}
              </ToneBadge>
            </button>
            <button
              type="button"
              className="store-icon-button"
              aria-pressed={isFavorite}
              aria-label={`${isFavorite ? "Remove" : "Add"} ${app.name} ${isFavorite ? "from" : "to"} favorites on this device`}
              onClick={() => toggleFavorite(app.slug)}
            >
              <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function StoreCollectionPage({ page }: { page: StoreCollectionPageName }) {
  const { allApps, bootstrap, device } = useStorefront();
  const copy = PAGE_COPY[page];
  const apps = appsForCollection(
    page,
    { myApps: bootstrap.myApps, availableApps: bootstrap.availableApps, allApps },
    device.favorites,
    device.recent
  );

  return (
    <section className="store-page">
      <div className="store-page-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
        </div>
        {page === "favorites" || page === "recent" ? (
          <span className="store-device-label"><MonitorSmartphone size={15} /> This device</span>
        ) : null}
      </div>
      {apps.length ? <StoreAppList apps={apps} /> : (
        <SectionCard eyebrow={copy.eyebrow} title={`No ${copy.title.toLocaleLowerCase()} yet`}>
          <p>{copy.empty}</p>
        </SectionCard>
      )}
    </section>
  );
}
