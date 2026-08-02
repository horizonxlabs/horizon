import { DecisionPanel, SectionCard, ToneBadge } from "@evcp/ui";
import { RotateCcw } from "lucide-react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { useFrontendVersions } from "./use-frontend-versions";

export function VersionsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const versions = useFrontendVersions(app.selectedProject.id);
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Frontend versions">
          <SectionCard
            eyebrow="Frontend Checkpoints"
            title={`Versions: ${app.selectedProject.name}`}
            action={
              <button
                type="button"
                className="ghost-button"
                onClick={() => void versions.refresh()}
                disabled={versions.status === "loading"}
              >
                <RotateCcw size={14} /> Refresh
              </button>
            }
          >
            <p role="status">{versions.message}</p>
            {versions.status === "error" ? (
              <DecisionPanel
                tone="warning"
                badge="Platform API unavailable"
                title="Frontend history is unavailable"
                lines={["No local or demo checkpoints are shown."]}
              />
            ) : null}
            <div className="creator-ticket-list">
              {versions.timeline?.checkpoints.map((checkpoint) => (
                <article key={checkpoint.id}>
                  <div>
                    <strong>{checkpoint.version}</strong>
                    <span>{checkpoint.changeSummary}</span>
                    <span>
                      {checkpoint.changedAreas.join(", ") || "No changed areas reported"} ·{" "}
                      {checkpoint.createdAt}
                    </span>
                  </div>
                  <ToneBadge tone={checkpoint.status === "current" ? "success" : "info"}>
                    {checkpoint.status}
                  </ToneBadge>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void versions.restoreCheckpoint(checkpoint.id)}
                    disabled={
                      checkpoint.status === "current" ||
                      versions.restoringCheckpointId !== undefined
                    }
                  >
                    <RotateCcw size={14} />
                    {versions.restoringCheckpointId === checkpoint.id ? "Restoring…" : "Restore"}
                  </button>
                </article>
              ))}
            </div>
          </SectionCard>
        </section>
      }
    />
  );
}
