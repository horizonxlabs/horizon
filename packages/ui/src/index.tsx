import type { AppStoreItem, NavItem, ProjectSummary, ServiceStatus, Status } from "@evcp/types";
import type { ReactNode } from "react";

export function statusClassName(status: Status): string {
  if (status === "healthy" || status === "published") return "status status-success";
  if (status === "warning" || status === "pending" || status === "draft") return "status status-warning";
  if (status === "degraded") return "status status-warning";
  if (status === "down") return "status status-danger";
  return "status";
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={statusClassName(status)}>{status}</span>;
}

export function AppShell({
  title,
  navItems,
  userName,
  children
}: {
  title: string;
  navItems: NavItem[];
  userName: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <strong>{title}</strong>
        <nav>
          {navItems.map((item) => (
            <a href={item.route} key={item.route}>
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <span>Mock Environment</span>
          <span>{userName}</span>
        </header>
        {children}
      </main>
    </div>
  );
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="card metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
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
      <p>{project.prdVersion} · {project.frontendVersion}</p>
      <StatusPill status={project.status} />
      <div className="actions">
        <a href={`/creator/projects/${project.slug}`}>Open</a>
        <a href={`/creator/projects/${project.slug}/prd`}>PRD</a>
      </div>
    </article>
  );
}

export function AppCard({ app }: { app: AppStoreItem }) {
  const action = app.accessStatus === "active" ? "Open" : "Request Access";

  return (
    <article className="card">
      <h3>{app.name}</h3>
      <p>{app.description}</p>
      <p>{app.myRole ? `Role: ${app.myRole}` : "Access required"}</p>
      <StatusPill status={app.health} />
      <button type="button">{action}</button>
    </article>
  );
}

