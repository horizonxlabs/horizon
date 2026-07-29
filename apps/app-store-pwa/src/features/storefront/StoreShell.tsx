import type { ReactNode } from "react";
import { useState } from "react";
import { SectionCard } from "@evcp/ui";
import type { StoreRoute } from "@/routes/store-route";
import { signInStoreSessionBridge } from "./bootstrap";
import { StorefrontSummary } from "./StorefrontSummary";
import { useStorefront } from "./StoreProvider";

export function StoreShell({ route, children }: { route: StoreRoute; children: ReactNode }) {
  const { bootstrap, logout } = useStorefront();
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
    return <main className="store-shell"><SectionCard eyebrow="App Store" title="Loading your apps"><h1>Loading Horizon Store</h1><p>Loading current access and installed applications from Platform API.</p></SectionCard></main>;
  }

  if (bootstrap.status === "error") {
    return <main className="store-shell"><SectionCard eyebrow="Secure session" title="Sign-in required"><h1>Sign-in required</h1><p>{bootstrap.error}</p><button type="button" onClick={handleSignIn} disabled={isSigningIn}>{isSigningIn ? "Opening sign-in…" : "Sign in with Keycloak"}</button></SectionCard></main>;
  }

  return (
    <main className="store-shell">
      <StorefrontSummary
        userName={bootstrap.userName}
        email={bootstrap.email}
        source={bootstrap.source}
        myAppsCount={bootstrap.myApps.length}
        currentPath={route.page === "my-apps" ? "/store/" : route.page === "not-found" ? "" : `/store/${route.page}`}
        isSigningIn={isSigningIn}
        onSignIn={handleSignIn}
        onLogout={() => void logout()}
      />
      {children}
    </main>
  );
}
