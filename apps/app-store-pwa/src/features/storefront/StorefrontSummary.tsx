import { navigation } from "@evcp/config";
import type { PlatformRole } from "@evcp/types";
import { navigateBrowserPath, ToneBadge } from "@evcp/ui";
import { PackageSearch, ShieldCheck, Store } from "lucide-react";

type StorefrontSummaryProps = {
  userName?: string;
  email?: string;
  role?: PlatformRole;
  source: "Platform API";
  myAppsCount: number;
  catalogCount: number;
  currentPath: string;
  onLogout: () => void;
  logoutError?: string;
};

function activeRoute(currentPath: string, route: string): boolean {
  const normalize = (value: string) => value.replace(/\/+$/, "") || "/";
  return normalize(currentPath) === normalize(route);
}

export function StorefrontSummary({
  userName,
  email,
  role,
  source,
  myAppsCount,
  catalogCount,
  currentPath,
  onLogout,
  logoutError
}: StorefrontSummaryProps) {
  return (
    <>
      <header className="store-mobile-header">
        <div>
          <span className="eyebrow">Private PWA</span>
          <p className="store-brand">Horizon Store</p>
          <p>
            {userName ?? "Loading account…"}
            {email ? ` · ${email}` : ""}
          </p>
        </div>
        <div className="store-header-actions">
          <ToneBadge tone="success">{source}</ToneBadge>
          {role ? <ToneBadge tone="neutral">{role.replace("_", " ")}</ToneBadge> : null}
          <button type="button" className="secondary-button" onClick={onLogout}>
            Logout
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
      </nav>

      {logoutError ? (
        <section className="store-action-error" role="alert">
          <strong>Sign-out not completed.</strong> {logoutError}
          <button type="button" className="secondary-button" onClick={onLogout}>
            Retry sign out
          </button>
        </section>
      ) : null}

      <section className="store-status-strip" aria-label="Store summary">
        <div>
          <Store size={17} />
          <span>My Apps</span>
          <strong>{myAppsCount}</strong>
        </div>
        <div>
          <PackageSearch size={17} />
          <span>Catalog</span>
          <strong>{catalogCount}</strong>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>Access</span>
          <strong>SSO</strong>
        </div>
      </section>
    </>
  );
}
