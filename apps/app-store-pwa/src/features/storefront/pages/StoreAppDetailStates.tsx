import type { StorefrontAppDetailResponse } from "@evcp/api-client";
import { navigateBrowserPath, SectionCard } from "@evcp/ui";
import { appInstallJourneySteps, installJourneyStatus } from "@/features/installations";
import type { StoreAppActionState } from "../StoreProvider";

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
  installStatus,
  accessRequestConfirmed,
  detailCapabilitiesCurrent,
  installationStatusConfirmed
}: {
  action: StorefrontAppDetailResponse["actions"][number];
  actions: StorefrontAppDetailResponse["actions"];
  accessStatus: StorefrontAppDetailResponse["accessStatus"];
  installStatus: StorefrontAppDetailResponse["installStatus"];
  accessRequestConfirmed: boolean;
  detailCapabilitiesCurrent: boolean;
  installationStatusConfirmed: boolean;
}): boolean {
  if (action === "request_access" && accessRequestConfirmed) {
    return false;
  }
  if (!detailCapabilitiesCurrent) {
    return false;
  }
  if (!installationStatusConfirmed) {
    return actions.includes(action);
  }
  if (action === "request_access" && accessStatus === "active") {
    return false;
  }
  if (action === "install" && (accessStatus !== "active" || installStatus === "installed")) {
    return false;
  }
  if ((action === "open" || action === "uninstall") && installStatus !== "installed") {
    return false;
  }
  return actions.includes(action);
}

export function deriveStoreAppDetailJourney({
  app,
  currentHomeApp,
  detailCapabilitiesCurrent,
  installActionState,
  uninstallActionState
}: {
  app: StorefrontAppDetailResponse;
  currentHomeApp?: Pick<StorefrontAppDetailResponse, "accessStatus" | "installStatus">;
  detailCapabilitiesCurrent: boolean;
  installActionState?: StoreAppActionState;
  uninstallActionState?: StoreAppActionState;
}) {
  const installEvidence =
    installActionState?.pending || installActionState?.installationStatus
      ? installActionState
      : undefined;
  const uninstallEvidence =
    uninstallActionState?.pending || uninstallActionState?.installationStatus
      ? uninstallActionState
      : undefined;
  const installIsLatest = (installEvidence?.sequence ?? -1) >= (uninstallEvidence?.sequence ?? -1);
  const journeyApp = {
    accessStatus: currentHomeApp?.accessStatus ?? app.accessStatus,
    installStatus: currentHomeApp?.installStatus ?? app.installStatus
  };
  const visibleInstallStatus =
    !installIsLatest && uninstallEvidence?.installationStatus === "disabled"
      ? "not_installed"
      : journeyApp.installStatus;
  const capabilityAccessStatus = detailCapabilitiesCurrent
    ? app.accessStatus
    : journeyApp.accessStatus;
  const currentDetailInstallStatus = detailCapabilitiesCurrent
    ? app.installStatus
    : journeyApp.installStatus;
  const capabilityInstallStatus =
    installIsLatest && installEvidence?.installationStatus === "active"
      ? "installed"
      : !installIsLatest && uninstallEvidence?.installationStatus === "disabled"
        ? "not_installed"
        : currentDetailInstallStatus;
  const installJourneyRows = appInstallJourneySteps.map((step) => ({
    ...step,
    status: installJourneyStatus(
      step.id,
      journeyApp,
      installIsLatest ? installEvidence?.installationStatus : undefined,
      installIsLatest && (installEvidence?.pending ?? false),
      installIsLatest ? undefined : uninstallEvidence?.installationStatus,
      !installIsLatest && (uninstallEvidence?.pending ?? false)
    )
  }));
  return {
    journeyApp,
    capabilityAccessStatus,
    visibleInstallStatus,
    capabilityInstallStatus,
    installJourneyRows
  };
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
      <SectionCard eyebrow="Platform API" title="Refreshing current app actions">
        <p role="status">Confirming the actions currently supported for this application.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard eyebrow="Platform API" title="Current app actions unavailable">
      <p role="alert">
        The latest app status is preserved, but current actions could not be refreshed:{" "}
        {state.error}
      </p>
      <button type="button" onClick={onRetry}>
        Retry current actions
      </button>
    </SectionCard>
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
      <div className="store-page-heading">
        <div>
          <span className="eyebrow">Platform API app detail</span>
          <h1>App details</h1>
        </div>
      </div>
      <SectionCard eyebrow="Platform API" title="Loading app">
        <p>Loading app details and supported actions.</p>
      </SectionCard>
    </section>
  );
}

export function StoreAppDetailErrorPage({ error, onRetry }: { error: string; onRetry(): void }) {
  return (
    <section className="store-page">
      <div className="store-page-heading">
        <div>
          <span className="eyebrow">Platform API app detail</span>
          <h1>App details</h1>
        </div>
      </div>
      <SectionCard eyebrow="Platform API" title="App details unavailable">
        <p>{error}</p>
        <div className="store-action-row">
          <button type="button" onClick={onRetry}>
            Retry app details
          </button>
          <button type="button" onClick={() => navigateBrowserPath("/store/")}>
            Return to Apps
          </button>
        </div>
      </SectionCard>
    </section>
  );
}
