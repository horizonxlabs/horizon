import { Button, SectionCard } from "@evcp/ui";
import {
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Link2,
  LockKeyhole,
  MonitorCheck,
  Store
} from "lucide-react";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorState, CreatorStatusMessage } from "@/shared";

function readableStatus(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PublishPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    accessLoadState,
    handlePublishProject,
    isPublishingProject,
    publishMessage,
    publishMessageTechnicalDetails,
    publishMessageTone,
    publishResult,
    publishReview,
    refreshCreatorPublishState,
    selectedProject,
    visibleDeployment,
    visiblePreview,
    visiblePublishChecklist,
    visibleRegistryEntry
  } = app;
  const manifest = publishReview?.manifest ?? publishResult?.manifest;
  const resolvedAccessState = accessLoadState ?? (publishReview ? "ready" : "loading");
  const accessReady = resolvedAccessState === "ready";
  const readinessAvailable = accessReady && Boolean(publishReview);
  const canPublish = readinessAvailable && publishReview?.ready === true;
  const failedChecks = visiblePublishChecklist.filter((item) => item.state === "fail");
  const permissionChecks = visiblePublishChecklist.filter((item) =>
    /access|auth|owner|permission|role/i.test(item.check)
  );
  const previewChecks = visiblePublishChecklist.filter((item) =>
    /frontend|preview/i.test(item.check)
  );
  const manifestVersion = manifest?.manifestVersion;
  const route = manifest?.app?.route;
  const permissionsReady =
    readinessAvailable &&
    Boolean(manifest?.auth?.mode) &&
    Boolean(manifest?.roles?.length) &&
    permissionChecks.every((item) => item.state === "pass");
  const previewReady =
    readinessAvailable &&
    Boolean(manifest?.frontend?.checkpointId || visiblePreview.id) &&
    previewChecks.every((item) => item.state === "pass");
  const registryReady = readinessAvailable;
  const unavailableDetail =
    resolvedAccessState === "loading"
      ? "Waiting for access and publish information."
      : "Readiness information is currently unavailable.";
  const readinessSteps = [
    {
      label: "Manifest",
      ready: readinessAvailable && Boolean(manifestVersion),
      detail: readinessAvailable
        ? manifestVersion
          ? `Version ${manifestVersion}`
          : "Generate a manifest before publishing."
        : unavailableDetail,
      icon: FileCheck2
    },
    {
      label: "Route",
      ready: readinessAvailable && Boolean(route),
      detail: readinessAvailable
        ? route || "Configure an application route before publishing."
        : unavailableDetail,
      icon: Link2
    },
    {
      label: "Permissions",
      ready: permissionsReady,
      detail: readinessAvailable
        ? permissionsReady
          ? "Access roles and ownership are configured."
          : "Resolve access requirements before publishing."
        : unavailableDetail,
      icon: LockKeyhole
    },
    {
      label: "Preview",
      ready: previewReady,
      detail: readinessAvailable
        ? previewReady
          ? `Frontend ${manifest?.frontend?.version ?? visiblePreview.version} is available.`
          : "Generate or restore an active frontend preview."
        : unavailableDetail,
      icon: MonitorCheck
    },
    {
      label: "Registry",
      ready: registryReady,
      detail: readinessAvailable
        ? visibleRegistryEntry
          ? `Registry entry ${visibleRegistryEntry.slug} is available.`
          : "The registry entry will be created during publish."
        : unavailableDetail,
      icon: Store
    }
  ];
  const blockerSummary =
    resolvedAccessState === "loading"
      ? "Publish readiness is loading. Wait for the latest access information before publishing."
      : resolvedAccessState === "unavailable" || !publishReview
        ? "Publish readiness is unavailable. Retry loading access and publish information."
        : failedChecks.length
          ? `Resolve ${failedChecks.length} readiness ${failedChecks.length === 1 ? "requirement" : "requirements"} before publishing.`
          : "Resolve the remaining readiness requirements before publishing.";
  const showPublishOutcome = publishMessageTone === "danger" || Boolean(publishResult);

  return (
    <CreatorShell
      app={app}
      content={
        <section className="creator-publish-layout" aria-label="Publish app">
          <SectionCard
            eyebrow="Readiness"
            title="Publish readiness"
            action={
              <Button
                type="button"
                className="creator-publish-action"
                variant={canPublish ? "primary" : "secondary"}
                onClick={handlePublishProject}
                disabled={isPublishingProject || !canPublish}
                aria-busy={isPublishingProject || undefined}
              >
                <Store size={16} aria-hidden="true" />
                {isPublishingProject ? "Publishing…" : "Publish to App Store"}
              </Button>
            }
          >
            {showPublishOutcome ? (
              <CreatorStatusMessage
                tone={publishMessageTone === "danger" ? "danger" : "success"}
                technicalDetails={publishMessageTechnicalDetails}
              >
                {publishMessage}
              </CreatorStatusMessage>
            ) : null}

            <ol className="creator-readiness-list" aria-label="Publish readiness">
              {readinessSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <li
                    className={`creator-readiness-item ${step.ready ? "is-ready" : "is-blocking"}`}
                    key={step.label}
                  >
                    <span className="creator-readiness-marker" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="creator-readiness-copy">
                      <strong>{step.label}</strong>
                      <span>{step.detail}</span>
                    </span>
                    <span className="creator-readiness-state">
                      {step.ready ? (
                        <CheckCircle2 size={15} aria-hidden="true" />
                      ) : (
                        <CircleAlert size={15} aria-hidden="true" />
                      )}
                      {step.ready ? "Ready" : "Blocking"}
                    </span>
                  </li>
                );
              })}
            </ol>

            {!canPublish ? (
              <CreatorStatusMessage
                tone="warning"
                technicalDetails={showPublishOutcome ? undefined : publishMessageTechnicalDetails}
              >
                <strong>{blockerSummary}</strong>
                {failedChecks.length ? (
                  <span className="creator-publish-blocker-list">
                    {failedChecks.map((item) => item.check).join(", ")}
                  </span>
                ) : null}
                {resolvedAccessState === "unavailable" || !publishReview ? (
                  <span className="creator-publish-retry">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void refreshCreatorPublishState(selectedProject.id).catch(() => undefined);
                      }}
                    >
                      Retry readiness
                    </Button>
                  </span>
                ) : null}
              </CreatorStatusMessage>
            ) : null}
          </SectionCard>

          <SectionCard eyebrow="Published output" title="Latest deployment">
            {visibleDeployment ? (
              <div className="creator-published-output">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <strong>{readableStatus(visibleDeployment.status)}</strong>
                  <span>
                    {readableStatus(visibleDeployment.environment)} · Manifest version {visibleDeployment.manifestVersion}
                  </span>
                  <small title={visibleDeployment.id}>Deployment {visibleDeployment.id}</small>
                </div>
              </div>
            ) : (
              <CreatorState
                kind="empty"
                title="No published deployment yet"
                description="A deployment record will appear here after the first successful publish."
              />
            )}
          </SectionCard>
        </section>
      }
    />
  );
}
