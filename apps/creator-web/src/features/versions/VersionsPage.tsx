import { Button, SectionCard, ToneBadge } from "@evcp/ui";
import { RotateCcw } from "lucide-react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { CreatorState, CreatorStatusMessage } from "@/shared";
import { useFrontendVersions, type FrontendVersionsClient } from "./use-frontend-versions";

const checkpointDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function formatCheckpointDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : checkpointDate.format(date);
}

export function VersionsPage({
  app,
  client
}: {
  app: ReturnType<typeof useCreatorApp>;
  client?: FrontendVersionsClient;
}) {
  const versions = useFrontendVersions(app.selectedProject.id, client);
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Frontend versions">
          <SectionCard
            eyebrow="Frontend Checkpoints"
            title={`Versions: ${app.selectedProject.name}`}
            action={
              <Button
                type="button"
                variant="ghost"
                className="max-md:min-h-11"
                onClick={() => void versions.refresh()}
                disabled={versions.status === "loading"}
              >
                <RotateCcw size={14} /> Refresh
              </Button>
            }
          >
            {versions.status === "loading" ? (
              <CreatorState kind="loading" title="Loading checkpoints" />
            ) : versions.status === "error" ? (
              <CreatorState
                kind="unavailable"
                title={
                  versions.failedRestoreCheckpointId
                    ? "Checkpoint could not be restored"
                    : "Checkpoints could not be loaded"
                }
                description="Existing frontend versions are unchanged."
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void (versions.failedRestoreCheckpointId
                        ? versions.restoreCheckpoint(versions.failedRestoreCheckpointId)
                        : versions.refresh())
                    }
                  >
                    Retry
                  </Button>
                }
                technicalDetails={versions.message}
              />
            ) : versions.timeline ? (
              <>
                {versions.failedRestoreCheckpointId ? (
                  <CreatorStatusMessage tone="danger" technicalDetails={versions.message}>
                    Checkpoint could not be restored. Existing frontend versions are unchanged.
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void versions.restoreCheckpoint(versions.failedRestoreCheckpointId!)
                      }
                    >
                      Retry restore
                    </Button>
                  </CreatorStatusMessage>
                ) : versions.lastRestore ? (
                  <CreatorStatusMessage tone="success">
                    Frontend restored from {versions.lastRestore.restoredFrom.version}.
                  </CreatorStatusMessage>
                ) : null}
                {versions.timeline.checkpoints.length ? (
                  <div className="creator-ticket-list">
                    {versions.timeline.checkpoints.map((checkpoint) => (
                      <article key={checkpoint.id}>
                        <div>
                          <strong>{checkpoint.version}</strong>
                          <span>{checkpoint.changeSummary}</span>
                          <span>
                            {checkpoint.changedAreas.join(", ") || "No changed areas reported"} ·{" "}
                            {formatCheckpointDate(checkpoint.createdAt)}
                          </span>
                        </div>
                        <ToneBadge tone={checkpoint.status === "current" ? "success" : "info"}>
                          {checkpoint.status === "current" ? "Current" : "Available"}
                        </ToneBadge>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void versions.restoreCheckpoint(checkpoint.id)}
                          disabled={
                            checkpoint.status === "current" ||
                            versions.restoringCheckpointId !== undefined
                          }
                        >
                          <RotateCcw size={14} />
                          {versions.restoringCheckpointId === checkpoint.id
                            ? "Restoring…"
                            : "Restore"}
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <CreatorState kind="empty" title="No checkpoints yet" />
                )}
              </>
            ) : versions.lastRestore ? (
              <CreatorStatusMessage tone="warning" technicalDetails={versions.message}>
                Frontend restored. Checkpoint history could not be refreshed.
              </CreatorStatusMessage>
            ) : (
              <CreatorState kind="empty" title="No checkpoints yet" />
            )}
          </SectionCard>
        </section>
      }
    />
  );
}
