import type { ReactNode } from "react";
import { useState } from "react";
import { SectionCard } from "@evcp/ui";
import type { StoreRoute } from "@/routes/store-route";
import { signInStoreSessionBridge } from "./bootstrap";
import { StorefrontSummary } from "./StorefrontSummary";
import { useStorefront } from "./StoreProvider";

function isAuthenticationError(message: string | undefined): boolean {
  return /session (?:has ended|.*expired|.*required)|sign[ -]?in|unauthenticated|unauthorized|missing authorization bearer|\b401\b|token expired/i.test(
    message ?? ""
  );
}

export function StoreShell({ route, children }: { route: StoreRoute; children: ReactNode }) {
  const { bootstrap, logout, logoutError, refreshHome } = useStorefront();
  const [isSigningIn, setIsSigningIn] = useState(false);

  function handleSignIn() {
    setIsSigningIn(true);
    try {
      signInStoreSessionBridge();
    } catch {
      setIsSigningIn(false);
    }
  }

  if (bootstrap.status === "loading") {
    return (
      <main className="store-shell">
        <SectionCard eyebrow="App Store" title="Loading your apps">
          <h1>Loading Horizon Store</h1>
          <p>Loading current access and installed applications from Platform API.</p>
        </SectionCard>
      </main>
    );
  }

  if (bootstrap.status === "error") {
    const authenticationError = isAuthenticationError(bootstrap.error);
    return (
      <main className="store-shell">
        <SectionCard
          eyebrow={authenticationError ? "Secure session" : "Platform API"}
          title={authenticationError ? "Sign-in required" : "Store unavailable"}
        >
          <h1>{authenticationError ? "Sign-in required" : "Store unavailable"}</h1>
          <p>{bootstrap.error}</p>
          {authenticationError ? (
            <button type="button" onClick={handleSignIn} disabled={isSigningIn}>
              {isSigningIn ? "Opening sign-in…" : "Sign in with Keycloak"}
            </button>
          ) : (
            <button type="button" onClick={() => void refreshHome()}>
              Retry Store
            </button>
          )}
        </SectionCard>
      </main>
    );
  }

  return (
    <main className="store-shell">
      <StorefrontSummary
        userName={bootstrap.userName}
        email={bootstrap.email}
        role={bootstrap.role}
        source={bootstrap.source}
        myAppsCount={bootstrap.myApps.length}
        catalogCount={bootstrap.myApps.length + bootstrap.availableApps.length}
        currentPath={
          route.page === "my-apps"
            ? "/store/"
            : route.page === "ticket-detail"
              ? "/store/tickets"
              : route.page === "not-found"
                ? ""
                : `/store/${route.page}`
        }
        onLogout={() => void logout()}
        logoutError={logoutError}
      />
      {children}
    </main>
  );
}
