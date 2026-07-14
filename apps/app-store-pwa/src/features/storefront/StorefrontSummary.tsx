import type { AppStoreItem } from "@evcp/types";
import { AppCard, ToneBadge } from "@evcp/ui";
import { Bell, Search, ShieldCheck, Store, WifiOff } from "lucide-react";

type StorefrontSummaryProps = {
  userName?: string;
  email?: string;
  source: "Platform API";
  myApps: AppStoreItem[];
  availableApps: AppStoreItem[];
  isSigningIn: boolean;
  onSignIn: () => void;
  onLogout: () => void;
};

export function StorefrontSummary({ userName, email, source, myApps, availableApps, isSigningIn, onSignIn, onLogout }: StorefrontSummaryProps) {
  return (
    <>
      <header className="store-mobile-header">
        <div>
          <span className="eyebrow">Private PWA</span>
          <h1>Horizon Store</h1>
          <p>
            {userName ?? "Loading account…"}{email ? ` · ${email}` : ""}
          </p>
        </div>
        <div className="store-header-actions">
          <ToneBadge tone="success">
            {source}
          </ToneBadge>
          <button
            type="button"
            className="secondary-button"
            onClick={onSignIn}
            disabled={isSigningIn}
          >
            <ShieldCheck size={15} />
            {isSigningIn ? "Signing in" : "Sign in with Keycloak"}
          </button>
          <button type="button" className="secondary-button" onClick={onLogout}>
            Logout
          </button>
          <button type="button" className="store-icon-button" aria-label="Notifications">
            <Bell size={18} />
          </button>
        </div>
      </header>

      <section className="store-search-panel" aria-label="Search apps">
        <Search size={18} />
        <input aria-label="Search apps" placeholder="Search apps, teams or role..." />
      </section>

      <section className="store-status-strip" aria-label="Store summary">
        <div>
          <Store size={17} />
          <span>My Apps</span>
          <strong>{myApps.length}</strong>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>Access</span>
          <strong>SSO</strong>
        </div>
        <div>
          <WifiOff size={17} />
          <span>Offline</span>
          <strong>Ready</strong>
        </div>
      </section>

      <section className="store-section">
        <div className="store-section-title">
          <h2>My Apps</h2>
          <ToneBadge tone="success">active</ToneBadge>
        </div>
        {myApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </section>

      <section className="store-section">
        <div className="store-section-title">
          <h2>Available Apps</h2>
          <ToneBadge tone="warning">request required</ToneBadge>
        </div>
        {availableApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </section>

    </>
  );
}
