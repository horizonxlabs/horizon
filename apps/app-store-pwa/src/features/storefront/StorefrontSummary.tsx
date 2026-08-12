import { useCallback, type ReactNode, useState } from "react";
import type { PlatformRole } from "@evcp/types";
import { PackageSearch, ShieldCheck, Store } from "lucide-react";
import type { StoreRoute } from "@/routes/store-route";
import { StoreSidebar } from "./StoreSidebar";
import { StoreTopbar, type StoreShellAvailability } from "./StoreTopbar";
import { storeCurrentPath } from "./store-navigation";

type StorefrontSummaryProps = {
  route: StoreRoute;
  userName?: string;
  email?: string;
  role?: PlatformRole;
  source: "Platform API";
  availability?: StoreShellAvailability;
  myAppsCount: number;
  catalogCount: number;
  requestCount: number;
  ticketCount: number;
  refreshPending: boolean;
  refreshError?: string;
  onRefresh: () => void;
  onLogout: () => void;
  logoutError?: string;
  children?: ReactNode;
};

export function StorefrontSummary({
  route,
  userName,
  email,
  role,
  source,
  availability = "ready",
  myAppsCount,
  catalogCount,
  requestCount,
  ticketCount,
  refreshPending,
  refreshError,
  onRefresh,
  onLogout,
  logoutError,
  children
}: StorefrontSummaryProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeNavigation = useCallback(() => setMobileOpen(false), []);
  const ready = availability === "ready";

  return (
    <div className="store-workspace-frame">
      <StoreSidebar
        currentPath={storeCurrentPath(route)}
        mobileOpen={mobileOpen}
        onNavigate={closeNavigation}
        onClose={closeNavigation}
        requestCount={ready ? requestCount : 0}
        ticketCount={ready ? ticketCount : 0}
        userName={ready ? userName : undefined}
        email={ready ? email : undefined}
        role={ready ? role : undefined}
        onLogout={ready ? onLogout : undefined}
      />
      <div className="store-workspace-content">
        <StoreTopbar
          route={route}
          source={source}
          availability={availability}
          refreshPending={refreshPending}
          refreshError={refreshError}
          onRefresh={onRefresh}
          navigationOpen={mobileOpen}
          onOpenNavigation={() => setMobileOpen(true)}
        />
        {logoutError ? (
          <section className="store-action-error" role="alert">
            <strong>Sign-out not completed.</strong> {logoutError}
            <button type="button" className="secondary-button" onClick={onLogout}>
              Retry sign out
            </button>
          </section>
        ) : null}
        {ready ? (
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
        ) : null}
        <div className="store-content-canvas">{children}</div>
      </div>
    </div>
  );
}
