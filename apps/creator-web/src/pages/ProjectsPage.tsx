import { ArrowRight, Plus, Search, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { CreatorShell } from "../components/CreatorShell";
import type { useCreatorApp } from "../hooks/use-creator-app";
import type { CreatorPage, CreatorProjectView } from "../types";

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

const PROMPT_SUGGESTIONS = [
  "ระบบขออนุมัติลางานหลายระดับ",
  "ระบบจัดซื้อจัดจ้างพร้อม workflow อนุมัติ",
  "แดชบอร์ดติดตาม KPI ทีมขาย",
  "ระบบจองห้องประชุมและทรัพยากร"
];

export function ProjectsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { bootstrap, selectedProject, handleSelectProject, setIsCreateProjectDialogOpen } = app;
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");

  function startFromPrompt() {
    if (prompt.trim()) app.handleCreateProjectField("businessProblem", prompt.trim());
    setIsCreateProjectDialogOpen(true);
  }

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
        <div className="hz-home">
          <section className="hz-hero">
            <span className="hz-hero-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              Horizon AI Builder
            </span>
            <h1 className="hz-hero-title">อยากสร้างแอปอะไรวันนี้?</h1>
            <p className="hz-hero-sub">
              อธิบายปัญหาหรือแอปที่ต้องการ แล้ว Horizon จะช่วยร่าง PRD และ generate แอปให้อัตโนมัติ
            </p>

            <form
              className="hz-prompt"
              onSubmit={(event) => {
                event.preventDefault();
                startFromPrompt();
              }}
            >
              <WandSparkles className="hz-prompt-icon" size={18} aria-hidden="true" />
              <textarea
                className="hz-prompt-input"
                placeholder="เช่น ระบบขออนุมัติลางานสำหรับพนักงาน มีอนุมัติหลายระดับ และแดชบอร์ดสรุป…"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
                aria-label="Describe the app to build"
              />
              <button type="submit" className="hz-prompt-cta">
                <span>สร้างแอป</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </form>

            <div className="hz-chips" aria-label="Prompt suggestions">
              {PROMPT_SUGGESTIONS.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  className="hz-chip"
                  onClick={() => setPrompt(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </section>

          <section className="hz-projects">
            <div className="hz-projects-head">
              <h2>
                โปรเจกต์ของคุณ <span className="hz-count">{projects.length}</span>
              </h2>
              <div className="hz-projects-tools">
                <div className="hz-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    placeholder="ค้นหาโปรเจกต์…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search projects"
                  />
                </div>
                <button
                  type="button"
                  className="hz-btn-create"
                  onClick={() => setIsCreateProjectDialogOpen(true)}
                >
                  <Plus size={16} aria-hidden="true" />
                  สร้างใหม่
                </button>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="hz-empty">
                {query
                  ? `ไม่พบโปรเจกต์ที่ตรงกับ “${query}”`
                  : "ยังไม่มีโปรเจกต์ — เริ่มจาก prompt ด้านบน"}
              </div>
            ) : (
              <div className="hz-grid" aria-label="Creator projects">
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
          </section>
        </div>
      }
    />
  );
}
