import { DefaultPage } from "@/features/default-dashboard";
import { PrdPage } from "@/features/prd";
import { ProjectsPage } from "@/features/projects";
import { PublishPage } from "@/features/publish";
import { TicketsPage } from "@/features/tickets";
import { UsersPage } from "@/features/users";
import { WorkspacePage } from "@/features/workspace";
import type { useCreatorApp } from "@/app/use-creator-app";

export function CreatorRoutes({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  if (app.creatorPage === "projects") return <ProjectsPage app={app} />;
  if (app.creatorPage === "workspace") return <WorkspacePage app={app} />;
  if (app.creatorPage === "prd") return <PrdPage app={app} />;
  if (app.creatorPage === "users") return <UsersPage app={app} />;
  if (app.creatorPage === "publish") return <PublishPage app={app} />;
  if (app.creatorPage === "tickets") return <TicketsPage app={app} />;
  return <DefaultPage app={app} />;
}
