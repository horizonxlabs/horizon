import { appStoreItems, mockUsers } from "@evcp/mock-data";
import { AppCard, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { Bell, Bug, MessageSquare, Search, Send, ShieldCheck, Store, WifiOff } from "lucide-react";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

const ticketTimeline = [
  { label: "Ticket submitted", value: "TKT-0001", tone: "success" as const },
  { label: "Creator review", value: "In review", tone: "warning" as const },
  { label: "PRD change decision", value: "Waiting", tone: "neutral" as const }
];

function StoreApp() {
  const myApps = appStoreItems.filter((app) => app.accessStatus === "active");
  const availableApps = appStoreItems.filter((app) => app.accessStatus !== "active");
  const selectedApp = myApps[0];

  return (
    <main className="store-shell">
      <header className="store-mobile-header">
        <div>
          <span className="eyebrow">Private PWA</span>
          <h1>App Store</h1>
          <p>{mockUsers.endUser.name} · {mockUsers.endUser.email}</p>
        </div>
        <button type="button" className="store-icon-button" aria-label="Notifications">
          <Bell size={18} />
        </button>
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
