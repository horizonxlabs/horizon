import type { ReactNode } from "react";
import { useState } from "react";
import type { StoreRoute } from "@/routes/store-route";
import { signInStoreSessionBridge } from "./bootstrap";
import { StorefrontSummary } from "./StorefrontSummary";
import { useStorefront } from "./StoreProvider";
import { StoreStatePanel } from "./StoreStatePanel";

function isAuthenticationError(message: string | undefined): boolean {
  return /session (?:has ended|.*expired|.*required)|sign[ -]?in|unauthenticated|unauthorized|missing authorization bearer|\b401\b|token expired/i.test(
    message ?? ""
  );
}

export function StoreShell({ route, children }: { route: StoreRoute; children: ReactNode }) {
  const { allApps, bootstrap, device, logout, logoutError, refreshHome } = useStorefront();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();

  function handleSignIn() {
    setIsSigningIn(true);
    try {
      signInStoreSessionBridge();
    } catch {
      setIsSigningIn(false);
    }
  }

  async function handleRefresh() {
    setRefreshPending(true);
    setRefreshError(undefined);
    const result = await refreshHome({ preserveReadyOnFailure: true });
    if (!result.ok) setRefreshError(result.error.message);
    setRefreshPending(false);
  }

  if (bootstrap.status === "loading") {
    return (
      <main className="store-workspace">
        <StorefrontSummary
          route={route}
          source="Platform API"
          availability="loading"
          myAppsCount={0}
          catalogCount={0}
          requestCount={0}
          ticketCount={0}
          refreshPending={false}
          onRefresh={() => undefined}
          onLogout={() => undefined}
        >
          <section aria-busy="true" aria-label="Loading Horizon Store">
            <span className="eyebrow">App Store</span>
            <h1>Loading Horizon Store</h1>
            <p>Loading your current access and available applications from Platform API.</p>
            <div className="store-loading-skeletons" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </section>
        </StorefrontSummary>
      </main>
    );
  }

  if (bootstrap.status === "error") {
    const authenticationError = isAuthenticationError(bootstrap.error);
    return (
      <main className="store-workspace">
        <StorefrontSummary
          route={route}
          source="Platform API"
          availability={authenticationError ? "authentication-error" : "platform-error"}
          myAppsCount={0}
          catalogCount={0}
          requestCount={0}
          ticketCount={0}
          refreshPending={refreshPending}
          onRefresh={() => void handleRefresh()}
          onLogout={() => undefined}
        >
          <StoreStatePanel
            tone="danger"
            primary
            eyebrow={authenticationError ? "Secure session" : "Platform API"}
            title={authenticationError ? "Sign-in required" : "Store unavailable"}
            action={
              authenticationError ? (
                <button type="button" onClick={handleSignIn} disabled={isSigningIn}>
                  {isSigningIn ? "Opening sign-in…" : "Sign in with Keycloak"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshPending}
                >
                  {refreshPending ? "Retrying Store…" : "Retry Store"}
                </button>
              )
            }
          >
            <p>{bootstrap.error}</p>
          </StoreStatePanel>
        </StorefrontSummary>
      </main>
    );
  }

  return (
    <main className="store-workspace">
      {refreshError ? (
        <p className="store-action-error" role="alert">
          {refreshError}
        </p>
      ) : null}
      <StorefrontSummary
        route={route}
        userName={bootstrap.userName}
        email={bootstrap.email}
        role={bootstrap.role}
        source={bootstrap.source}
        myAppsCount={allApps.filter((app) => app.accessStatus === "active").length}
        catalogCount={allApps.length}
        requestCount={device.accessReceipts.length}
        ticketCount={device.ticketIds.length}
        refreshPending={refreshPending}
        refreshError={refreshError}
        onRefresh={() => void handleRefresh()}
        onLogout={() => void logout()}
        logoutError={logoutError}
      >
        {children}
      </StorefrontSummary>
    </main>
  );
}
