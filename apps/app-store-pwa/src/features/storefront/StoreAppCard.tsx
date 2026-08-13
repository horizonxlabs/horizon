import type { AppStoreItem } from "@evcp/types";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { Heart } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useStorefront } from "./StoreProvider";
import { storeAppAccent, storeAppCardAction } from "./store-app-card";

export function StoreAppCard({ app }: { app: AppStoreItem }) {
  const { api, device, toggleFavorite, recordRecent } = useStorefront();
  const action = storeAppCardAction(app);
  const isFavorite = device.favorites.includes(app.slug);
  const detailHref = `/store/apps/${encodeURIComponent(app.slug)}`;
  const [launchState, setLaunchState] = useState<{ pending: boolean; error?: string }>({
    pending: false
  });

  function navigateToDetail(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    navigateBrowserPath(detailHref);
  }

  async function handlePrimaryAction(event: MouseEvent<HTMLAnchorElement>) {
    if (!action.href) return;
    event.preventDefault();
    if (action.kind === "open") {
      if (launchState.pending) return;
      recordRecent(app.slug);
      setLaunchState({ pending: true });
      try {
        await api.authorizeStoreAppLaunch(app.slug, action.href);
        window.location.assign(action.href);
      } catch (error) {
        setLaunchState({
          pending: false,
          error: error instanceof Error ? error.message : "Unable to open this app."
        });
      }
      return;
    }
    navigateBrowserPath(action.href);
  }

  return (
    <article className="store-app-card">
      <a className="store-app-detail-link" href={detailHref} onClick={navigateToDetail}>
        <span className="store-app-icon" data-accent={storeAppAccent(app.slug)} aria-hidden="true">
          {app.name.slice(0, 1).toUpperCase()}
        </span>
        <span>
          <strong>{app.name}</strong>
          <small>{app.description}</small>
          <em>{app.owner}</em>
        </span>
      </a>
      <div className="store-app-status">
        <ToneBadge tone={app.accessStatus === "active" ? "success" : "warning"}>
          {app.accessStatus}
        </ToneBadge>
        <span>{app.health}</span>
      </div>
      <button
        type="button"
        className="store-icon-button"
        aria-pressed={isFavorite}
        aria-label={`${isFavorite ? "Remove" : "Add"} ${app.name} ${isFavorite ? "from" : "to"} favorites on this device`}
        onClick={() => toggleFavorite(app.slug)}
      >
        <Heart aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
      </button>
      <a
        className="store-app-primary"
        href={action.kind === "open" ? detailHref : action.href}
        aria-disabled={launchState.pending || undefined}
        onClick={(event) => void handlePrimaryAction(event)}
      >
        {launchState.pending ? "Opening…" : action.label}
      </a>
      {launchState.error ? (
        <p className="store-action-error" role="alert">
          {launchState.error}
        </p>
      ) : null}
    </article>
  );
}
