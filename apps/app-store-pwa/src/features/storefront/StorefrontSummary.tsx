import { navigation } from "@evcp/config";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { Bell, Search, ShieldCheck, Store, WifiOff } from "lucide-react";

type StorefrontSummaryProps = {
  userName?: string;
  email?: string;
  source: "Platform API";
  myAppsCount: number;
  currentPath: string;
  isSigningIn: boolean;
  onSignIn: () => void;
  onLogout: () => void;
};

function activeRoute(currentPath: string, route: string): boolean {
  const normalize = (value: string) => value.replace(/\/+$/, "") || "/";
  return normalize(currentPath) === normalize(route);
}

export function StorefrontSummary({
  userName,
  email,
  source,
  myAppsCount,
  currentPath,
  isSigningIn,
  onSignIn,
  onLogout
}: StorefrontSummaryProps) {
  return (
    <>
      <header className="store-mobile-header">
        <div>
          <span className="eyebrow">Private PWA</span>
          <p className="store-brand">Horizon Store</p>
          <p>{userName ?? "Loading account…"}{email ? ` · ${email}` : ""}</p>
        </div>
        <div className="store-header-actions">
          <ToneBadge tone="success">{source}</ToneBadge>
          <button type="button" className="secondary-button" onClick={onSignIn} disabled={isSigningIn}>
            <ShieldCheck size={15} />
            {isSigningIn ? "Signing in" : "Sign in with Keycloak"}
          </button>
          <button type="button" className="secondary-button" onClick={onLogout}>Logout</button>
          <button type="button" className="store-icon-button" aria-label="Notifications">
            <Bell size={18} />
          </button>
        </div>
      </header>

      <nav className="store-navigation" aria-label="Horizon Store navigation">
        {navigation.store.map((item) => {
          const isActive = activeRoute(currentPath, item.route);
          return (
            <a
              key={item.route}
              href={item.route}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigateBrowserPath(item.route);
              }}
            >
              {item.label}
            </a>
          );
        })}
        <button type="button" onClick={() => navigateBrowserPath("/store/search")}>
          <Search size={15} /> Search
        </button>
      </nav>

      <section className="store-status-strip" aria-label="Store summary">
        <div><Store size={17} /><span>My Apps</span><strong>{myAppsCount}</strong></div>
        <div><ShieldCheck size={17} /><span>Access</span><strong>SSO</strong></div>
        <div><WifiOff size={17} /><span>Offline</span><strong>Ready</strong></div>
      </section>
    </>
  );
}
