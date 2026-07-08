import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { CreatorShell } from "../components/CreatorShell";
import type { useCreatorApp } from "../hooks/use-creator-app";
import type { CreatorPage, CreatorProjectView } from "../types";

// Deterministic brand gradient per project (we have no stored preview thumbnails yet), so the same
// project always renders the same colors across sessions and environments.
function projectGradient(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 56%), hsl(${(hue + 42) % 360} 74% 44%))`;
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
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
        <div className="hz-projects">
          <div className="hz-toolbar">
            <h1>Projects</h1>
            <div className="hz-toolbar-controls">
              <div className="hz-search">
                <Search size={16} aria-hidden="true" />
                <input
                  placeholder="Search projects..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search projects"
                />
              </div>
              <span className="hz-filter">
                <SlidersHorizontal size={14} aria-hidden="true" />
                Last edited
              </span>
              <span className="hz-filter">Any status</span>
              <button
                type="button"
                className="hz-btn-create"
                onClick={() => setIsCreateProjectDialogOpen(true)}
              >
                <Plus size={16} aria-hidden="true" />
                Create
              </button>
            </div>
          </div>

          <span className="hz-section-label">All projects · {projects.length}</span>

          {projects.length === 0 ? (
            <div className="hz-empty">ไม่พบ project ที่ตรงกับ “{query}”</div>
          ) : (
            <div className="hz-grid" aria-label="Creator projects">
              {projects.map((project) => {
                const isActive = project.id === selectedProject.id;
                return (
                  <button
                    type="button"
                    key={project.id}
                    className={`hz-card ${isActive ? "active" : ""}`.trim()}
                    onClick={() => void handleSelectProject(project, "projects" as CreatorPage)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <div className="hz-thumb" style={{ background: projectGradient(project.id) }}>
                      <span className="hz-badge">{project.status}</span>
                      <span className="hz-thumb-glyph">{initials(project.name)}</span>
                    </div>
                    <div className="hz-card-meta">
                      <span className="hz-avatar">{initials(project.owner)}</span>
                      <div>
                        <strong>{project.name}</strong>
                        <span>
                          {project.appType} · {project.owner}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="hz-selected-actions">
            <span>เลือกอยู่: {selectedProject.name}</span>
            <button type="button" onClick={() => void handleSelectProject(selectedProject, "prd")}>
              Review PRD
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void handleSelectProject(selectedProject, "workspace")}
            >
              Open Creator Workspace
            </button>
          </div>
        </div>
      }
    />
  );
}
