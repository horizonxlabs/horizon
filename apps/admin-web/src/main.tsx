import { navigation } from "@evcp/config";
import { mockUsers, projects, serviceStatuses } from "@evcp/mock-data";
import { AppShell, MetricCard, ServiceStatusList } from "@evcp/ui";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

function AdminApp() {
  return (
    <AppShell title="Admin Console" navItems={navigation.admin} userName={mockUsers.admin.name}>
      <h1>System Overview</h1>
      <div className="grid">
        <MetricCard label="Health" value="3/4 Healthy" />
        <MetricCard label="Apps" value={String(projects.length)} />
        <MetricCard label="AI Usage" value="12.4k tokens" />
      </div>
      <ServiceStatusList services={serviceStatuses} />
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<AdminApp />);
