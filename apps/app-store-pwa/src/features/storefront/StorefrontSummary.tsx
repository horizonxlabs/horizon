import { useCallback, type ReactNode, useState } from "react";
import type { PlatformRole } from "@evcp/types";
import { PackageSearch, ShieldCheck, Store } from "lucide-react";
import type { StoreRoute } from "@/routes/store-route";
import { StorePageHeader } from "./StorePageHeader";
import { StoreSidebar } from "./StoreSidebar";
import { StoreTopbar } from "./StoreTopbar";
import { storeCurrentPath, storePageContext } from "./store-navigation";

type StorefrontSummaryProps = {
  route: StoreRoute;
  userName?: string;
  email?: string;
  role?: PlatformRole;
  source: "Platform API";
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

function isDeviceLocalRoute(route: StoreRoute): boolean {
  return ["favorites", "recent", "access-requests", "tickets", "profile"].includes(route.page);
}

export function StorefrontSummary({
  route,
  userName,
  email,
  role,
  source,
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
  const pageContext = storePageContext(route);
  const closeNavigation = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="store-workspace-frame">
      <StoreSidebar
        currentPath={storeCurrentPath(route)}
        mobileOpen={mobileOpen}
        onNavigate={closeNavigation}
        onClose={closeNavigation}
        requestCount={requestCount}
        ticketCount={ticketCount}
      />
      <div className="store-workspace-content">
        <StoreTopbar
          route={route}
          userName={userName}
          email={email}
          role={role}
          source={source}
          refreshPending={refreshPending}
          refreshError={refreshError}
          onRefresh={onRefresh}
          onOpenNavigation={() => setMobileOpen(true)}
          onLogout={onLogout}
        />
        <div className="store-brand-region">
          <p className="store-brand horizon-brand-lockup" aria-label="Horizon Store">
            <img
              src="/store/horizon-mark.png"
              alt=""
              className="horizon-brand-mark"
              draggable={false}
            />
            <span className="horizon-brand-name">Horizon Store</span>
          </p>
        </div>
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
        <StorePageHeader
          {...pageContext}
          count={route.page === "my-apps" ? myAppsCount : undefined}
          deviceLocal={isDeviceLocalRoute(route)}
        />
        <div className="store-content-canvas">{children}</div>
      </div>
    </div>
  );
}
