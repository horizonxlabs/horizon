import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "@evcp/ui";
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
            <h1 className="hz-hero-title">เริ่มสร้างแอปภายในองค์กร</h1>
            <p className="hz-hero-sub">
              สร้าง project ใหม่ — ระบุรายละเอียดแอป แล้วระบบจะสร้าง PRD draft ให้ก่อน เพื่อยืนยัน spec ก่อนเริ่มพัฒนา
            </p>
            <Button variant="primary" onClick={() => setIsCreateProjectDialogOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              <span>สร้าง Project ใหม่</span>
            </Button>
          </section>

          <section className="hz-projects" aria-label="รายการโปรเจกต์">
            <div className="hz-projects-head">
              <h2>
                โปรเจกต์ล่าสุด <span className="hz-count">{projects.length}</span>
              </h2>
              <div className="hz-projects-tools">
                <Input
                  placeholder="ค้นหาโปรเจกต์…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="ค้นหาโปรเจกต์"
                />
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="hz-empty">
                {normalized
                  ? `ไม่พบโปรเจกต์ที่ตรงกับ “${query.trim()}” ลองใช้คำค้นอื่น`
                  : "ยังไม่มีโปรเจกต์ กด “สร้าง Project ใหม่” ด้านบนเพื่อเริ่ม"}
              </div>
            ) : (
              <div className="hz-grid" aria-label="รายการโปรเจกต์">
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
                        <span className="hz-project-status">{project.status}</span>
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
          </section>
        </div>
      }
    />
  );
}
