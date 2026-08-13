import type { StorefrontAppDetailResponse } from "@evcp/api-client";
import { navigateBrowserPath } from "@evcp/ui";
import { StorePageHeader } from "../StorePageHeader";
import type { StoreAppActionState } from "../StoreProvider";
import { StoreStatePanel } from "../StoreStatePanel";

export type StoreAppDetailState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; app: StorefrontAppDetailResponse };

export type StoreAppCapabilityRefreshState =
  { status: "idle" } | { status: "refreshing" } | { status: "error"; error: string };

export function storeAppDetailErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function storeAppDetailSupportsAction({
  action,
  actions,
  accessStatus,
  health,
  route,
  accessRequestConfirmed,
  detailCapabilitiesCurrent
}: {
  action: StorefrontAppDetailResponse["actions"][number];
  actions: StorefrontAppDetailResponse["actions"];
  accessStatus: StorefrontAppDetailResponse["accessStatus"];
  health: StorefrontAppDetailResponse["health"];
  route: StorefrontAppDetailResponse["route"];
  accessRequestConfirmed: boolean;
  detailCapabilitiesCurrent: boolean;
}): boolean {
  if (!detailCapabilitiesCurrent || action === "install" || action === "uninstall") return false;
  if (action === "open") {
    return accessStatus === "active" && health === "healthy" && Boolean(route.trim());
  }
  if (action === "view_status") return accessStatus === "pending";
  if (action === "request_access") {
    return accessStatus === "available" && !accessRequestConfirmed;
  }
  return actions.includes(action);
}

export function StoreAppCapabilityRefreshStatus({
  state,
  onRetry
}: {
  state: StoreAppCapabilityRefreshState;
  onRetry(): void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "refreshing") {
    return (
      <div className="store-app-capability-status">
        <h2>Refreshing current app actions</h2>
        <p role="status">Confirming the actions currently supported for this application.</p>
      </div>
    );
  }
  return (
    <div className="store-app-capability-status store-app-capability-status-error">
      <h2>Current app actions unavailable</h2>
      <p role="alert">
        The latest app status is preserved, but current actions could not be refreshed:{" "}
        {state.error}
      </p>
      <button type="button" onClick={onRetry}>
        Retry current actions
      </button>
    </div>
  );
}

export function StoreAppActionFeedback({ state }: { state?: StoreAppActionState }) {
  if (state?.error) {
    return (
      <p role="alert" className="store-action-error">
        {state.error}
      </p>
    );
  }
  return state?.success ? (
    <p role="status" className="store-action-success">
      {state.success}
    </p>
  ) : null;
}

export function StoreAppDetailLoadingPage() {
  return (
    <section className="store-page">
      <StorePageHeader eyebrow="Application" title="App details" />
      <StoreStatePanel eyebrow="Platform API" title="Loading app">
        <p>Loading app details and supported actions.</p>
      </StoreStatePanel>
    </section>
  );
}

export function StoreAppDetailErrorPage({ error, onRetry }: { error: string; onRetry(): void }) {
  return (
    <section className="store-page">
      <StorePageHeader eyebrow="Application" title="App details" />
      <StoreStatePanel eyebrow="Platform API" title="App details unavailable" tone="danger">
        <p>{error}</p>
        <div className="store-action-row">
          <button type="button" onClick={onRetry}>
            Retry app details
          </button>
          <button type="button" onClick={() => navigateBrowserPath("/store/")}>
            Return to Apps
          </button>
        </div>
      </StoreStatePanel>
    </section>
  );
}
