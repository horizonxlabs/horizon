import { DecisionPanel, DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { CheckCircle2, ClipboardCheck, Store } from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";

export function PublishPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    handlePublishProject,
    isPublishingProject,
    publishReview,
    publishResult,
    visibleRegistryEntry,
    visiblePublishChecklist,
    visibleDeployment,
    visiblePreview,
    publishMessage
  } = app;
  return (
    <CreatorShell
      app={app}
      content={
        <section className="sprint6-shell" aria-label="Publish app">
          <SectionCard
            eyebrow="Publish Review"
            title="Manifest + Readiness checklist"
            action={
              <button
                type="button"
                onClick={handlePublishProject}
                disabled={isPublishingProject || !publishReview || !publishReview.ready}
              >
                <Store size={15} /> {isPublishingProject ? "Publishing" : "Publish to App Store"}
              </button>
            }
          >
            <p>{publishMessage}</p>
            <DefinitionGrid
              items={[
                {
                  label: "Manifest",
                  value:
                    (publishReview?.manifest.manifestVersion ??
                    publishResult?.manifest.manifestVersion)
                      ? `manifest v${publishReview?.manifest.manifestVersion ?? publishResult?.manifest.manifestVersion}`
                      : "No manifest returned"
                },
                {
                  label: "Route",
                  value:
                    publishReview?.manifest.app?.route ??
                    publishResult?.manifest.app?.route ??
                    "No route returned"
                },
                {
                  label: "Auth",
                  value: publishReview?.manifest.auth?.mode ?? "No auth mode returned"
                },
                {
                  label: "Frontend",
                  value:
                    publishReview?.manifest.frontend?.checkpointId ??
                    visiblePreview.version ??
                    "No preview returned"
                },
                {
                  label: "Visibility",
                  value: visibleRegistryEntry?.visibility ?? "No registry entry returned"
                }
              ]}
            />
            <div className="publish-checklist">
              {visiblePublishChecklist.map((item) => (
                <div key={item.check}>
                  <ClipboardCheck size={16} />
                  <strong>{item.check}</strong>
                  <span>{item.detail}</span>
                  <ToneBadge tone={item.state === "pass" ? "success" : "danger"}>
                    {item.state}
                  </ToneBadge>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard eyebrow="Deployment Record" title="Published Output">
            {visibleDeployment ? (
              <div className="deployment-record">
                <CheckCircle2 size={20} />
                <div>
                  <strong>{visibleDeployment.id}</strong>
                  <span>
                    {visibleDeployment.status} · manifest v{visibleDeployment.manifestVersion}
                  </span>
                </div>
              </div>
            ) : (
              <DecisionPanel
                tone="warning"
                badge="API required"
                title="No deployment record"
                lines={[
                  "A deployment appears here only after Platform API publishes a healthy revision."
                ]}
              />
            )}
          </SectionCard>
        </section>
      }
    />
  );
}
