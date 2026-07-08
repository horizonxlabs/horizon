import type { AppStoreItem, NavItem, ProjectSummary, ServiceStatus, Status } from "@evcp/types";
import { useState } from "react";
import type { ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

export function statusClassName(status: Status): string {
  if (status === "healthy" || status === "published") return "status status-success";
  if (status === "warning" || status === "pending" || status === "draft")
    return "status status-warning";
  if (status === "degraded") return "status status-warning";
  if (status === "down") return "status status-danger";
  return "status";
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={statusClassName(status)}>{status}</span>;
}

export function ToneBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tone-badge tone-${tone}`}>{children}</span>;
}

function normalizeRoute(route: string): string {
  const normalized = route.replace(/\/+$/, "");
  return normalized || "/";
}

function navItemMatchesPath(item: NavItem, currentPath: string): boolean {
  const itemRoute = normalizeRoute(item.route);
  const path = normalizeRoute(currentPath);
  if (itemRoute === path) return true;
  return itemRoute !== "/" && path.startsWith(`${itemRoute}/`);
}

function resolveActiveNavItem(navItems: NavItem[], currentPath: string): NavItem | undefined {
  return [...navItems]
    .filter((item) => navItemMatchesPath(item, currentPath))
    .sort((a, b) => normalizeRoute(b.route).length - normalizeRoute(a.route).length)[0];
}

function createInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "EV";
  if (words[0] === words[0].toUpperCase() && words[0].length > 1) return words[0].slice(0, 2);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function createNavAbbreviation(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function AppShell({
  title,
  navItems,
  userName,
  environmentLabel = "Private Server MVP",
  session,
  children
}: {
  title: string;
  navItems: NavItem[];
  userName: string;
  environmentLabel?: string;
  session?: ReactNode;
  children: ReactNode;
}) {
  const currentPath = typeof window === "undefined" ? "" : window.location.pathname;
  const activeNavItem = resolveActiveNavItem(navItems, currentPath) ?? navItems[0];
  const activeRoute = activeNavItem ? normalizeRoute(activeNavItem.route) : "";
  const brandMark = createInitials(title);
  const userInitials = createInitials(userName);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("evcp-sidebar-collapsed") === "true";
  });

  function handleToggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      if (typeof window !== "undefined")
        window.localStorage.setItem("evcp-sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell-collapsed" : ""}`.trim()}>
      <aside className="sidebar" aria-label={`${title} navigation`}>
        <div className="sidebar-brand">
          <span className="sidebar-mark" aria-hidden="true">
            {brandMark}
          </span>
          <div className="sidebar-title">
            <strong>{title}</strong>
            <span>Horizon Workspace</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={handleToggleSidebar}
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span aria-hidden="true">{isSidebarCollapsed ? "›" : "‹"}</span>
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = normalizeRoute(item.route) === activeRoute;
            return (
              <a
                className={isActive ? "active" : undefined}
                href={item.route}
                key={item.route}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
              >
                <span className="sidebar-nav-short" aria-hidden="true">
                  {createNavAbbreviation(item.label)}
                </span>
                <span className="sidebar-nav-label">{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span>Environment</span>
          <strong>{environmentLabel}</strong>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="topbar-context">
            <span>Current area</span>
            <strong>{activeNavItem?.label ?? "Overview"}</strong>
          </div>
          <div className="topbar-user">
            <span className="topbar-env">{environmentLabel}</span>
            {session ? <div className="topbar-session">{session}</div> : null}
            <span className="topbar-avatar" aria-hidden="true">
              {userInitials}
            </span>
            <strong>{userName}</strong>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  tone = "primary"
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: "primary" | "surface";
}) {
  return (
    <section className={`ds-page-header ds-page-header-${tone}`}>
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ds-page-actions">{actions}</div> : null}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <section className="card metric-card ds-metric-card">
      {icon ? <span className={`ds-icon-box tone-${tone}`}>{icon}</span> : null}
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </section>
  );
}

export function SectionCard({
  eyebrow,
  title,
  action,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`card ds-section-card ${className}`.trim()}>
      <div className="section-heading ds-section-heading">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="ds-section-action">{action}</div> : null}
      </div>
      {children}
    </article>
  );
}

export type DataTableColumn<Row extends Record<string, ReactNode>> = {
  key: keyof Row & string;
  label: string;
  tone?: (value: Row[keyof Row], row: Row) => Tone | undefined;
};

export function DataTable<Row extends Record<string, ReactNode>>({
  columns,
  rows,
  rowKey
}: {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  rowKey?: (row: Row, index: number) => string;
}) {
  return (
    <div className="table-wrap ds-table-wrap">
      <table className="ds-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey?.(row, index) ?? `${String(row[columns[0].key])}-${index}`}>
              {columns.map((column) => {
                const value = row[column.key];
                const tone = column.tone?.(value, row);
                return (
                  <td key={column.key}>
                    {tone ? <ToneBadge tone={tone}>{value}</ToneBadge> : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DefinitionGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="ds-definition-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DecisionPanel({
  tone,
  badge,
  title,
  lines
}: {
  tone: Tone;
  badge: string;
  title: string;
  lines: string[];
}) {
  return (
    <div className="ds-decision-panel">
      <ToneBadge tone={tone}>{badge}</ToneBadge>
      <strong>{title}</strong>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

export function WorkflowRail({
  eyebrow,
  title,
  steps,
  alert
}: {
  eyebrow?: string;
  title: string;
  steps: Array<{ label: string; icon?: ReactNode }>;
  alert?: { icon?: ReactNode; title: string; description: string; tone?: "warning" | "danger" };
}) {
  return (
    <aside className="ds-workflow-rail">
      <div className="ds-rail-card">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        <ol className="ds-flow-list">
          {steps.map((step) => (
            <li key={step.label}>
              {step.icon}
              {step.label}
            </li>
          ))}
        </ol>
      </div>
      {alert ? (
        <div className={`ds-rail-card ds-rail-alert ds-rail-alert-${alert.tone ?? "warning"}`}>
          {alert.icon}
          <div>
            <strong>{alert.title}</strong>
            <span>{alert.description}</span>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function ServiceStrip({
  services
}: {
  services: Array<{ name: string; detail: string; status: Status }>;
}) {
  return (
    <section className="ds-service-strip">
      {services.map((service) => (
        <div key={service.name}>
          <StatusPill status={service.status} />
          <strong>{service.name}</strong>
          <span>{service.detail}</span>
        </div>
      ))}
    </section>
  );
}

export function ServiceStatusList({ services }: { services: ServiceStatus[] }) {
  return (
    <section className="card">
      <h2>Service Status</h2>
      <ul>
        {services.map((service) => (
          <li key={service.name}>
            <span>{service.name}</span>
            <StatusPill status={service.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="card">
      <h3>{project.name}</h3>
      <p>{project.appType}</p>
      <p>
        {project.prdVersion} · {project.frontendVersion}
      </p>
      <StatusPill status={project.status} />
      <div className="actions">
        <a href={`/creator/projects/${project.slug}`}>Open</a>
        <a href={`/creator/projects/${project.slug}/prd`}>PRD</a>
      </div>
    </article>
  );
}

export function AppCard({ app }: { app: AppStoreItem }) {
  const canOpen = app.accessStatus === "active";
  const action = canOpen
    ? "Open App"
    : app.accessStatus === "pending"
      ? "View Status"
      : "Request Access";
  const route = app.route ?? `/apps/${app.slug}`;

  return (
    <article className={`store-app-card ${canOpen ? "" : "store-app-card-muted"}`.trim()}>
      <div className="store-app-icon" aria-hidden="true">
        {app.name.slice(0, 1)}
      </div>
      <div>
        <h3>{app.name}</h3>
        <span>{app.description}</span>
        <small>
          {app.myRole ? `Role: ${app.myRole}` : "Access required"}
          {app.installStatus
            ? ` · ${app.installStatus === "installed" ? "Installed" : "Not installed"}`
            : ""}
        </small>
      </div>
      <div className="store-app-card-actions">
        <StatusPill status={app.health} />
        {canOpen ? (
          <a className="button-link" href={route}>
            {action}
          </a>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={app.accessStatus === "pending"}
          >
            {action}
          </button>
        )}
      </div>
    </article>
  );
}
