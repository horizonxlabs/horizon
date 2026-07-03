import { navigation } from "@evcp/config";
import { mockUsers } from "@evcp/mock-data";
import { AppShell, MetricCard, ServiceStatusList } from "@evcp/ui";
import { createRoot } from "react-dom/client";
import "@evcp/ui/styles.css";

const providerRows = [
  {
    provider: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    status: "active",
    models: "gpt-4.1, gpt-4.1-mini",
    checked: "Just now"
  },
  {
    provider: "Anthropic Fallback",
    adapter: "anthropic",
    baseUrl: "https://api.anthropic.com",
    status: "active",
    models: "claude-3-5-sonnet",
    checked: "Just now"
  }
];

const apiKeyRows = [
  {
    name: "Primary Production Key",
    provider: "OpenAI Production",
    usageMode: "production",
    quota: "100k tokens/day",
    fallback: "Priority 1",
    fingerprint: "fp_9f2a4c01d881",
    status: "active"
  }
];

const routeRows = [
  {
    scenario: "Requirement Analysis",
    primary: "OpenAI Production / gpt-4.1",
    fallback: "Anthropic Fallback / claude-3-5-sonnet"
  },
  {
    scenario: "Frontend Coding",
    primary: "OpenAI Production / gpt-4.1-mini",
    fallback: "Anthropic Fallback / claude-3-5-sonnet"
  }
];

const guardrailRules = [
  {
    rule: "Block payroll export",
    severity: "high",
    action: "block",
    scope: "organization",
    status: "active"
  },
  {
    rule: "Warn confidential data",
    severity: "warning",
    action: "warn",
    scope: "organization",
    status: "active"
  }
];

const guardrailEvents = [
  {
    eventId: "gre_0001",
    decision: "Blocked",
    prompt: "Generate payroll export report",
    matchedRule: "Block payroll export",
    actor: "Admin User"
  }
];

function DataTable({
  columns,
  rows
}: {
  columns: string[];
  rows: Array<Record<string, string>>;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[columns[0]]}-${index}`}>
              {columns.map((column) => (
                <td key={column}>{row[column] ?? row[column.charAt(0).toLowerCase() + column.slice(1)]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminApp() {
  return (
    <AppShell title="Admin Console" navItems={navigation.admin} userName={mockUsers.admin.name}>
      <section className="page-header">
        <div>
          <h1>AI Providers & API Keys</h1>
          <p>Configure external providers, masked secrets, routing, quota, fallback and guardrails.</p>
        </div>
        <button type="button">เพิ่ม Provider</button>
      </section>

      <div className="grid metrics-grid">
        <MetricCard label="Health" value="3/4 Healthy" />
        <MetricCard label="Active Providers" value="2" />
        <MetricCard label="Active Keys" value="1" />
        <MetricCard label="Guardrail Blocks" value="1" />
      </div>

      <nav className="tabs" aria-label="AI governance sections">
        {["Providers", "Models", "API Keys", "Routing", "Quota", "Log"].map((tab) => (
          <a href={`/admin/ai-providers/${tab.toLowerCase().replaceAll(" ", "-")}`} key={tab}>
            {tab}
          </a>
        ))}
      </nav>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <h2>Providers</h2>
            <button type="button">Add API Key</button>
          </div>
          <DataTable columns={["provider", "adapter", "baseUrl", "status", "models", "checked"]} rows={providerRows} />
        </article>

        <article className="card">
          <div className="section-heading">
            <h2>API Keys</h2>
            <span className="status status-success">Secret saved. Only fingerprint is visible.</span>
          </div>
          <DataTable columns={["name", "provider", "usageMode", "quota", "fallback", "fingerprint", "status"]} rows={apiKeyRows} />
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <h2>Scenario Routing</h2>
            <button type="button">Configure Routing</button>
          </div>
          <DataTable columns={["scenario", "primary", "fallback"]} rows={routeRows} />
        </article>

        <article className="card quota-panel">
          <div className="section-heading">
            <h2>Token Quota</h2>
            <span className="status status-warning">800 warning threshold</span>
          </div>
          <div className="quota-list">
            <p><strong>Organization</strong><span>1,000 daily / 5,000 monthly</span></p>
            <p><strong>Creator</strong><span>500 daily / 2,000 monthly</span></p>
            <p><strong>Project</strong><span>300 daily / 1,500 monthly</span></p>
            <p><strong>App</strong><span>100 daily / 500 monthly</span></p>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="card">
          <div className="section-heading">
            <h2>Guardrail Rules</h2>
            <button type="button">Add Guardrail Rule</button>
          </div>
          <DataTable columns={["rule", "severity", "action", "scope", "status"]} rows={guardrailRules} />
        </article>

        <article className="card">
          <div className="section-heading">
            <h2>Test Prompt</h2>
            <span className="status status-danger">Blocked</span>
          </div>
          <label>
            Prompt
            <input defaultValue="Generate payroll export report" />
          </label>
          <div className="result-panel">
            <strong>Decision: block</strong>
            <span>Matched rule: Block payroll export</span>
            <span>Event id: gre_0001</span>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>Guardrail Events</h2>
          <span className="status status-warning">Filterable event log</span>
        </div>
        <DataTable columns={["eventId", "decision", "prompt", "matchedRule", "actor"]} rows={guardrailEvents} />
      </section>

      <ServiceStatusList
        services={[
          { name: "Provider Adapter Registry", status: "healthy", detail: "Mock and external adapter contracts ready" },
          { name: "Secret Storage", status: "healthy", detail: "Fingerprint only visible after save" },
          { name: "Quota Guard", status: "healthy", detail: "Hard stop before provider call" },
          { name: "Guardrail Event Log", status: "healthy", detail: "Blocked prompts recorded" }
        ]}
      />
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<AdminApp />);
