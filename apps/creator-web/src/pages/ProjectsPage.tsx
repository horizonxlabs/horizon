import { DecisionPanel, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { CheckCircle2, LayoutDashboard } from "lucide-react";
import { wizardSteps } from "../data/mock-data";
import { CreatorShell } from "../components/CreatorShell";
import type { useCreatorApp } from "../hooks/use-creator-app";
import type { CreatorPage } from "../types";

export function ProjectsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { bootstrap, selectedProject, currentPrdVersion, handleSelectProject } = app;
  return (
    <CreatorShell
      app={app}
      content={
        <section className="creator-summary-grid">
          <SectionCard eyebrow="Project Picker · โปรเจกต์ของฉัน" title={selectedProject.name}>
            <div className="creator-project-list" aria-label="Creator projects">
              {bootstrap.projects.map((project) => (
                <button
                  type="button"
                  className={`creator-project-card ${project.id === selectedProject.id ? "active" : ""}`.trim()}
                  key={project.id}
                  onClick={() => void handleSelectProject(project, "projects" as CreatorPage)}
                  aria-current={project.id === selectedProject.id ? "true" : undefined}
                >
                  <div className="ds-summary-icon">
                    <LayoutDashboard size={22} />
                  </div>
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {project.appType} · owner {project.owner}
                    </span>
                  </div>
                  <ToneBadge tone={project.id === selectedProject.id ? "success" : "warning"}>
                    {project.status}
                  </ToneBadge>
                </button>
              ))}
            </div>
            <DefinitionGrid
              items={[
                {
                  label: "PRD",
                  value: currentPrdVersion
                    ? `v${currentPrdVersion.version} ${currentPrdVersion.status}`
                    : "draft pending"
                },
                { label: "Frontend", value: selectedProject.frontendVersion },
                { label: "Access", value: "Owner" },
                { label: "Health", value: <ToneBadge tone="success">healthy</ToneBadge> }
              ]}
            />
            <div className="creator-card-actions">
              <button
                type="button"
                onClick={() => void handleSelectProject(selectedProject, "prd")}
              >
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
          </SectionCard>
          <SectionCard eyebrow="Create Project Wizard" title="Generate PRD">
            <div className="creator-step-list">
              {wizardSteps.map((step) => (
                <div key={step.title}>
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <ToneBadge tone={step.status === "complete" ? "success" : "info"}>
                    {step.status}
                  </ToneBadge>
                </div>
              ))}
            </div>
            <DecisionPanel
              tone="warning"
              badge="Guarded"
              title="PRD generation uses governed AI route"
              lines={[
                "Required fields complete",
                "Token quota available",
                "Guardrail decision: allow"
              ]}
            />
          </SectionCard>
        </section>
      }
    />
  );
}
