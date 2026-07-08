import type { AppStoreItem, ProjectSummary, ServiceStatus, Status } from "@evcp/types";
import type { ReactNode } from "react";

export { AppShell } from "./app-shell";

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
