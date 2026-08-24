import { Badge, Button, MetricCard, SectionCard } from "@evcp/ui";
import { ArrowRight, Blocks, Database, Rocket } from "lucide-react";
import { creatorPathForPage } from "@/app/routes";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";

function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function ProjectOverviewPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const project = app.selectedProject;
  const navigateTo = (page: "workspace" | "database" | "publish") =>
    app.onNavigate(creatorPathForPage(project.id, page));

  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Project overview">
          <SectionCard
            eyebrow="Project overview"
            title={project.name}
            action={
              <Badge tone="info" className="capitalize">
                {project.status}
              </Badge>
            }
          >
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-body">{project.appType}</p>
              <p className="text-sm text-muted">
                Key project information and shortcuts for managing this project.
              </p>
            </div>
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Status" value={project.status} hint="Project lifecycle" />
            <MetricCard label="PRD version" value={project.prdVersion} hint="Current baseline" />
            <MetricCard
              label="Frontend version"
              value={project.frontendVersion}
              hint="Current checkpoint"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard eyebrow="Project info" title="Project information">
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Project ID</dt>
                  <dd className="mt-1 break-all font-mono font-medium text-body">{project.id}</dd>
                </div>
                <div>
                  <dt className="text-muted">Owner</dt>
                  <dd className="mt-1 font-medium text-body">{project.owner}</dd>
                </div>
                <div>
                  <dt className="text-muted">App type</dt>
                  <dd className="mt-1 font-medium text-body">{project.appType}</dd>
                </div>
                <div>
                  <dt className="text-muted">Created</dt>
                  <dd className="mt-1 font-medium text-body">
                    {formatCreatedAt(project.createdAt)}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard eyebrow="Quick actions" title="Open a project area">
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => navigateTo("workspace")}>
                  <Blocks size={16} aria-hidden="true" /> Open Creator Workspace
                  <ArrowRight className="ml-auto" size={15} aria-hidden="true" />
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigateTo("database")}>
                  <Database size={16} aria-hidden="true" /> Manage Database
                  <ArrowRight className="ml-auto" size={15} aria-hidden="true" />
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigateTo("publish")}>
                  <Rocket size={16} aria-hidden="true" /> Publish project
                  <ArrowRight className="ml-auto" size={15} aria-hidden="true" />
                </Button>
              </div>
            </SectionCard>
          </div>
        </section>
      }
    />
  );
}
