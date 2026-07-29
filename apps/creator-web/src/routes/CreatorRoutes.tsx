import { DatabasePage } from "@/features/database";
import { DefaultPage } from "@/features/default-dashboard";
import { DeploymentsPage } from "@/features/deployments";
import { PrdPage } from "@/features/prd";
import { ProjectsPage } from "@/features/projects";
import { PublishPage } from "@/features/publish";
import { TicketsPage } from "@/features/tickets";
import { UsersPage } from "@/features/users";
import { VersionsPage } from "@/features/versions";
import { WorkspacePage } from "@/features/workspace";
import type { useCreatorApp } from "@/app/use-creator-app";

export function CreatorRoutes({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  if (app.bootstrap.status === "loading") {
    return (
      <main className="creator-page">
        <p role="status">Loading Creator projects from Platform API…</p>
      </main>
    );
  }
  if (app.bootstrap.status === "error") {
    return (
      <main className="creator-page">
        <h1>Creator data unavailable</h1>
        <p role="alert">{app.bootstrap.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }
  if (app.bootstrap.status === "empty") {
    return <ProjectsPage app={app} />;
  }
  if (app.creatorPage === "projects") return <ProjectsPage app={app} />;
  if (app.creatorPage === "workspace") return <WorkspacePage app={app} />;
  if (app.creatorPage === "prd") return <PrdPage app={app} />;
  if (app.creatorPage === "database") return <DatabasePage app={app} />;
  if (app.creatorPage === "versions") return <VersionsPage app={app} />;
  if (app.creatorPage === "users") return <UsersPage app={app} />;
  if (app.creatorPage === "publish") return <PublishPage app={app} />;
  if (app.creatorPage === "deployments") return <DeploymentsPage app={app} />;
  if (app.creatorPage === "tickets") return <TicketsPage app={app} />;
  return <DefaultPage app={app} />;
}
