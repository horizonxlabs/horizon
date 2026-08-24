import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "@evcp/ui";
import { CreatorState } from "@/shared";
import { CreatorShell } from "./CreatorShell";
import type { useCreatorApp } from "@/app/use-creator-app";
import type { CreatorProjectView } from "@/shared/types";
import type { CreatorPage } from "@/app/routes";

// Deterministic tone per project until stored preview thumbnails are available.
function projectToneClass(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `hz-thumb-tone-${hash % 6}`;
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function formatProjectStatus(status: string): string {
  const readable = status.trim().replace(/[_-]+/g, " ");
  if (!readable) return "Unknown";
  return readable.charAt(0).toUpperCase() + readable.slice(1).toLowerCase();
}

function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function ProjectsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { bootstrap, selectedProject, handleSelectProject, setIsCreateProjectDialogOpen } = app;
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const projects = bootstrap.projects.filter((project: CreatorProjectView) =>
    normalized === ""
      ? true
      : `${project.name} ${project.appType} ${project.owner}`.toLowerCase().includes(normalized)
  );

  return (
    <CreatorShell
      app={app}
      content={
        <div className="hz-home hz-projects-studio">
          <section className="hz-hero">
            <span className="hz-hero-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              Horizon AI Builder
            </span>
            <h1 className="hz-hero-title">Create your next internal application</h1>
            <p className="hz-hero-sub">
              Start with a business need. Horizon will prepare a PRD draft for review before
              development begins.
            </p>
            <Button variant="primary" onClick={() => setIsCreateProjectDialogOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              <span>Create project</span>
            </Button>
          </section>

          <section className="hz-projects" aria-label="Project list">
            <div className="hz-projects-head">
              <h2>
                Recent projects <span className="hz-count">{projects.length}</span>
              </h2>
              <div className="hz-projects-tools">
                <Input
                  placeholder="Search projects"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search projects"
                />
              </div>
            </div>

            {projects.length === 0 ? (
              <CreatorState
                kind="empty"
                title={normalized ? "No matching projects" : "No projects yet"}
                description={
                  normalized
                    ? `No projects match “${query.trim()}”. Try a different search.`
                    : "Create a project to turn your next business need into a reviewed application plan."
                }
              />
            ) : (
              <div className="hz-grid" aria-label="Project list">
                {projects.map((project) => {
                  const isActive = project.id === selectedProject.id;
                  return (
                    <button
                      type="button"
                      key={project.id}
                      className={`hz-card ${isActive ? "active" : ""}`.trim()}
                      onClick={() => void handleSelectProject(project, "workspace" as CreatorPage)}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className={`hz-thumb ${projectToneClass(project.id)}`}>
                        <span className="hz-project-status">
                          {formatProjectStatus(project.status)}
                        </span>
                        <span className="hz-thumb-glyph">{initials(project.name)}</span>
                      </div>
                      <div className="hz-card-meta">
                        <span className="hz-avatar">{initials(project.owner)}</span>
                        <div>
                          <strong>{project.name}</strong>
                          <span>{project.appType}</span>
                        </div>
                      </div>
                      <dl className="hz-card-details">
                        <div>
                          <dt>Owner</dt>
                          <dd>{project.owner}</dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>{formatCreatedAt(project.createdAt)}</dd>
                        </div>
                      </dl>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      }
    />
  );
}
