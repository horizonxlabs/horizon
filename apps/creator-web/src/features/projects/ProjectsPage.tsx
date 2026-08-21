import {
  ArrowRight,
  Bot,
  Eye,
  FileText,
  FolderKanban,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { Button } from "@evcp/ui";
import { CreatorShell } from "./CreatorShell";
import type { useCreatorApp } from "@/app/use-creator-app";
import { creatorPathForPage } from "@/app/routes";

function formatActivityDate(value: string | undefined): string {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function ProjectsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { selectedProject, setIsCreateProjectDialogOpen, workspaceSnapshot, currentPrdVersion } = app;
  const latestTask = workspaceSnapshot?.tasks.at(-1);
  const hasPreview = Boolean(workspaceSnapshot?.preview.id);
  const hasBaseline = currentPrdVersion?.status === "baseline";
  const hasDeployment = Boolean(app.visibleDeployment);
  const readinessCount = [hasPreview, hasBaseline, hasDeployment].filter(Boolean).length;

  const openPage = (page: "workspace" | "prd" | "users") => {
    if (page === "workspace") {
      void app.handleSelectProject(selectedProject, "workspace");
      return;
    }
    app.onNavigate(creatorPathForPage(selectedProject.id, page));
  };

  if (!selectedProject.id) {
    return (
      <CreatorShell
        app={app}
        content={
          <main className="creator-dashboard creator-dashboard-empty">
            <span className="creator-dashboard-empty-icon" aria-hidden="true">
              <FolderKanban size={26} />
            </span>
            <h1>Create your first project</h1>
            <p>Start with a business problem, then build and manage the app from one workspace.</p>
            <Button variant="primary" type="button" onClick={() => setIsCreateProjectDialogOpen(true)}>
              <Sparkles size={16} />
              Create project
            </Button>
          </main>
        }
      />
    );
  }

  return (
    <CreatorShell
      app={app}
      content={
        <main className="creator-dashboard">
          <section className="creator-dashboard-hero">
            <div className="creator-dashboard-hero-copy">
              <span className="creator-dashboard-eyebrow">
                <Sparkles size={14} aria-hidden="true" />
                Project dashboard
              </span>
              <div>
                <h1>{selectedProject.name}</h1>
                <p>{selectedProject.appType} · {selectedProject.status} · Owned by {selectedProject.owner}</p>
              </div>
            </div>
            <Button variant="primary" type="button" onClick={() => openPage("workspace")}>
              Continue building
              <ArrowRight size={16} />
            </Button>
          </section>

          <section className="creator-dashboard-summary" aria-label="Project status">
            <article>
              <span className="creator-dashboard-summary-icon is-build"><Bot size={18} /></span>
              <div><span>Build status</span><strong>{latestTask?.status === "running" ? "Building now" : latestTask ? "Ready to continue" : "Ready to start"}</strong></div>
            </article>
            <article>
              <span className="creator-dashboard-summary-icon is-preview"><Eye size={18} /></span>
              <div><span>Preview</span><strong>{hasPreview ? "Available" : "Not generated"}</strong></div>
            </article>
            <article>
              <span className="creator-dashboard-summary-icon is-ready"><ShieldCheck size={18} /></span>
              <div><span>Readiness</span><strong>{readinessCount} of 3 signals ready</strong></div>
            </article>
          </section>

          <div className="creator-dashboard-grid">
            <section className="creator-dashboard-card creator-dashboard-actions">
              <div className="creator-dashboard-card-heading"><div><span>Next steps</span><h2>Keep your project moving</h2></div></div>
              <button type="button" onClick={() => openPage("workspace")}><Bot size={18} /><span><strong>Continue building</strong><small>Describe the next change for the AI</small></span><ArrowRight size={16} /></button>
              <button type="button" onClick={() => openPage("workspace")}><Eye size={18} /><span><strong>Open preview</strong><small>{hasPreview ? "Review the latest version" : "Build the first preview"}</small></span><ArrowRight size={16} /></button>
              <button type="button" onClick={() => openPage("prd")}><FileText size={18} /><span><strong>{hasBaseline ? "Review PRD" : "Generate PRD"}</strong><small>{hasBaseline ? "View the confirmed product baseline" : "Create a product specification"}</small></span><ArrowRight size={16} /></button>
              <button type="button" onClick={() => openPage("users")}><Users size={18} /><span><strong>Manage access</strong><small>{app.visibleAppMembers.length} member{app.visibleAppMembers.length === 1 ? "" : "s"} with access</small></span><ArrowRight size={16} /></button>
            </section>

            <section className="creator-dashboard-card creator-dashboard-activity">
              <div className="creator-dashboard-card-heading"><div><span>Recent activity</span><h2>Project timeline</h2></div></div>
              <ol>
                {latestTask ? <li><span className="creator-dashboard-activity-dot is-build" /><div><strong>AI build {latestTask.status}</strong><small>{formatActivityDate(latestTask.createdAt)}</small></div></li> : null}
                {hasPreview ? <li><span className="creator-dashboard-activity-dot is-preview" /><div><strong>Preview version {workspaceSnapshot?.preview.version}</strong><small>{formatActivityDate(workspaceSnapshot?.preview.createdAt)}</small></div></li> : null}
                {currentPrdVersion ? <li><span className="creator-dashboard-activity-dot is-prd" /><div><strong>PRD {currentPrdVersion.status}</strong><small>Version {currentPrdVersion.version}</small></div></li> : null}
                {!latestTask && !hasPreview && !currentPrdVersion ? <li className="creator-dashboard-activity-empty">No activity yet. Start building to create your first update.</li> : null}
              </ol>
            </section>
          </div>

          <section className="creator-dashboard-card creator-dashboard-details">
            <div className="creator-dashboard-card-heading"><div><span>Project details</span><h2>At a glance</h2></div><Rocket size={19} aria-hidden="true" /></div>
            <dl><div><dt>App type</dt><dd>{selectedProject.appType}</dd></div><div><dt>Owner</dt><dd>{selectedProject.owner}</dd></div><div><dt>PRD version</dt><dd>{selectedProject.prdVersion || "Not created"}</dd></div><div><dt>Project ID</dt><dd title={selectedProject.id}>{selectedProject.id}</dd></div></dl>
          </section>
        </main>
      }
    />
  );
}
