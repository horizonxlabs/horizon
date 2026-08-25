import { DatabasePage } from "@/features/database";
import { DefaultPage } from "@/features/default-dashboard";
import { DeploymentsPage } from "@/features/deployments";
import { PrdPage } from "@/features/prd";
import { ProjectsPage } from "@/features/projects";
import { PublishPage } from "@/features/publish";
import { ProjectOverviewPage } from "@/features/project-overview";
import { ProjectSettingsPage } from "@/features/project-settings";
import { TicketDetailPage, TicketsPage } from "@/features/tickets";
import { UsersPage } from "@/features/users";
import { VersionsPage } from "@/features/versions";
import { WorkspacePage } from "@/features/workspace";
import { navigateBrowserPath } from "@evcp/ui";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState } from "@/shared";

export function CreatorRoutes({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const routeProjectUnavailable =
    app.bootstrap.status === "ready" &&
    app.creatorPage !== "not-found" &&
    Boolean(app.creatorRoute.projectId) &&
    !app.bootstrap.projects.some((project) => project.id === app.creatorRoute.projectId);
  if (app.bootstrap.status === "loading") {
    return (
      <main className="creator-page">
        <CreatorState
          kind="loading"
          title="Loading Creator projects"
          description="Retrieving the projects available to your account."
        />
      </main>
    );
  }
  if (app.bootstrap.status === "error") {
    return (
      <main className="creator-page">
        <CreatorState
          kind="unavailable"
          title={app.bootstrap.message ?? "Creator projects could not be loaded."}
          description="Your projects have not changed. Retry when the service is available."
          technicalDetails={app.bootstrap.technicalDetails}
          action={
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          }
        />
      </main>
    );
  }
  if (app.bootstrap.status === "empty") {
    return <ProjectsPage app={app} />;
  }
  if (app.requestedProjectUnavailable || routeProjectUnavailable) {
    return (
      <main className="creator-page">
        <h1>Project unavailable</h1>
        <p role="alert">
          The requested project is not available in the current Platform API project list.
        </p>
        <button type="button" onClick={() => navigateBrowserPath("/creator/")}>
          Return to Projects
        </button>
      </main>
    );
  }
  if (app.creatorPage === "projects") return <ProjectsPage app={app} />;
  if (app.creatorPage === "project") return <ProjectOverviewPage app={app} />;
  if (app.creatorPage === "workspace") return <WorkspacePage app={app} />;
  if (app.creatorPage === "prd") return <PrdPage app={app} />;
  if (app.creatorPage === "database") return <DatabasePage app={app} />;
  if (app.creatorPage === "versions") return <VersionsPage app={app} />;
  if (app.creatorPage === "users") return <UsersPage app={app} />;
  if (app.creatorPage === "publish") return <PublishPage app={app} />;
  if (app.creatorPage === "deployments") return <DeploymentsPage app={app} />;
  if (app.creatorPage === "settings") return <ProjectSettingsPage app={app} />;
  if (app.creatorPage === "tickets") return <TicketsPage app={app} />;
  if (app.creatorPage === "ticket-detail") return <TicketDetailPage app={app} />;
  return <DefaultPage app={app} />;
}
