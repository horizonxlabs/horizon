import { createPlatformApiClient, type CurrentUserResponse, type StorefrontAppCardDto, type StorefrontHomeResponse } from "@evcp/api-client";
import type { AppStoreItem } from "@evcp/types";
import { AppCard, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { Bell, Bug, MessageSquare, Search, Send, ShieldCheck, Store, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

const ticketTimeline = [
  { label: "Ticket submitted", value: "TKT-0001", tone: "success" as const },
  { label: "Creator review", value: "In review", tone: "warning" as const },
  { label: "PRD change decision", value: "Waiting", tone: "neutral" as const }
];

type StoreBootstrapState = {
  userName: string;
  email: string;
  myApps: AppStoreItem[];
  availableApps: AppStoreItem[];
  source: "Platform API" | "local fallback";
};

const fallbackStoreApps: AppStoreItem[] = [
  {
    id: "app_leave_management",
    slug: "leave-management",
    name: "Leave Management",
    description: "Submit, approve and track leave requests inside the private enterprise app store.",
    owner: "Creator User",
    myRole: "Employee",
    accessStatus: "active",
    health: "healthy"
  },
  {
    id: "app_procurement",
    slug: "procurement-request",
    name: "Procurement Request",
    description: "Request purchasing approval with governed access.",
    owner: "Finance Ops",
    accessStatus: "available",
    health: "healthy"
  }
];

const initialStoreBootstrap: StoreBootstrapState = {
  userName: "End User",
  email: "user@company.com",
  myApps: fallbackStoreApps.filter((app) => app.accessStatus === "active"),
  availableApps: fallbackStoreApps.filter((app) => app.accessStatus !== "active"),
  source: "local fallback"
};

function apiBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_PLATFORM_API_BASE_URL;
  if (!configured && import.meta.env.DEV) return undefined;
  return (configured || "/api").replace(/\/$/, "");
}

function platformSessionToken(): string | undefined {
  return window.localStorage.getItem("evcp_session") ?? undefined;
}

function appCardToStoreItem(app: StorefrontAppCardDto): AppStoreItem {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    owner: app.ownerName,
    myRole: app.myRole,
    accessStatus: app.accessStatus,
    health: app.health as AppStoreItem["health"]
  };
}

async function loadStoreBootstrap(): Promise<StoreBootstrapState> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Platform API base URL is not configured for local dev");
  const client = createPlatformApiClient({
    baseUrl,
    sessionToken: platformSessionToken(),
    legacyUserEmail: "user@company.com"
  });
  const [currentUser, storeHome]: [CurrentUserResponse, StorefrontHomeResponse] = await Promise.all([client.getCurrentUser(), client.listStoreApps()]);
  return {
    userName: storeHome.profile.userName || currentUser.user.name,
    email: storeHome.profile.email || currentUser.user.email,
    myApps: storeHome.myApps.map(appCardToStoreItem),
    availableApps: storeHome.availableApps.map(appCardToStoreItem),
    source: currentUser.auth.mode === "platform_session" ? "Platform API" : "local fallback"
  };
}

function StoreApp() {
  const [bootstrap, setBootstrap] = useState(initialStoreBootstrap);
  const myApps = bootstrap.myApps;
  const availableApps = bootstrap.availableApps;
  const selectedApp = myApps[0] ?? availableApps[0] ?? fallbackStoreApps[0];

  useEffect(() => {
    loadStoreBootstrap()
      .then(setBootstrap)
      .catch(() => setBootstrap(initialStoreBootstrap));
  }, []);

  return (
    <main className="store-shell">
      <header className="store-mobile-header">
        <div>
          <span className="eyebrow">Private PWA</span>
          <h1>App Store</h1>
          <p>{bootstrap.userName} · {bootstrap.email}</p>
        </div>
        <div className="store-header-actions">
          <ToneBadge tone={bootstrap.source === "Platform API" ? "success" : "neutral"}>{bootstrap.source}</ToneBadge>
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

      <section className="store-detail-grid" aria-label="App Detail and support">
        <SectionCard eyebrow="App Detail" title={selectedApp.name}>
          <DefinitionGrid
            items={[
              { label: "Owner", value: selectedApp.owner },
              { label: "Role", value: selectedApp.myRole ?? "Access required" },
              { label: "Health", value: <ToneBadge tone="success">{selectedApp.health}</ToneBadge> },
              { label: "Route", value: `/apps/${selectedApp.slug}` }
            ]}
          />
          <div className="store-action-row">
            <button type="button">Open</button>
            <button type="button" className="secondary-button">
              <Bug size={15} />
              Submit Ticket
            </button>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Request Access" title="Manager role request">
          <div className="store-form">
            <label>
              Requested role
              <input defaultValue="manager" />
            </label>
            <label>
              Reason
              <input defaultValue="Need approval queue access" />
            </label>
            <button type="button">
              <Send size={15} />
              Request Access
            </button>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Submit Ticket" title="Bug / Feedback">
          <div className="store-form">
            <label>
              Type
              <input defaultValue="bug" />
            </label>
            <label>
              Description
              <input defaultValue="WFH leave type not visible on mobile" />
            </label>
            <label>
              Device
              <input defaultValue="iPhone Safari" />
            </label>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Ticket Status" title="TKT-0001">
          <div className="ticket-timeline">
            {ticketTimeline.map((item) => (
              <div key={item.label}>
                <MessageSquare size={16} />
                <span>{item.label}</span>
                <ToneBadge tone={item.tone}>{item.value}</ToneBadge>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StoreApp />);
