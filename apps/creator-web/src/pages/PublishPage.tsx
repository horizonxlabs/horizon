import { DefinitionGrid, SectionCard, ToneBadge } from "@evcp/ui";
import { CheckCircle2, ClipboardCheck, Store } from "lucide-react";
import { CreatorShell } from "../components/CreatorShell";
import type { useCreatorApp } from "../hooks/use-creator-app";

export function PublishPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    selectedProject,
    handlePublishProject,
    isPublishingProject,
    publishReview,
    publishResult,
    visibleRegistryEntry,
    visiblePublishChecklist,
    visibleDeployment,
    visiblePreview
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
                disabled={isPublishingProject || publishReview?.ready === false}
              >
                <Store size={15} /> {isPublishingProject ? "Publishing" : "Publish to App Store"}
              </button>
            }
          >
            <DefinitionGrid
              items={[
                {
                  label: "Manifest",
                  value: `manifest v${publishReview?.manifest.manifestVersion ?? publishResult?.manifest.manifestVersion ?? "1"}`
                },
                {
                  label: "Route",
                  value:
                    publishReview?.manifest.app?.route ??
                    publishResult?.manifest.app?.route ??
                    `/apps/${selectedProject.id}`
                },
                { label: "Auth", value: publishReview?.manifest.auth?.mode ?? "platform_auth_sdk" },
                {
                  label: "Frontend",
                  value: publishReview?.manifest.frontend?.checkpointId ?? visiblePreview.version
                },
                { label: "Visibility", value: visibleRegistryEntry?.visibility ?? "restricted" }
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
            <div className="deployment-record">
              <CheckCircle2 size={20} />
              <div>
                <strong>{visibleDeployment?.id ?? "dep_leave_management_001"}</strong>
                <span>
                  {visibleDeployment?.status ?? "published"} · manifest v
                  {visibleDeployment?.manifestVersion ??
                    publishResult?.manifest.manifestVersion ??
                    "1"}
                </span>
              </div>
            </div>
          </SectionCard>
        </section>
      }
    />
  );
}
