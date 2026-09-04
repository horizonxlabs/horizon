import { Button, SectionCard } from "@evcp/ui";
import {
  buildSubdomainUrl,
  normalizeSubdomainSuggestion,
  validateSubdomainLabel
} from "@evcp/api-client";
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
import { useEffect, useRef, useState } from "react";
import { PublishAccessUrlCard } from "./PublishAccessUrlCard";

function readableStatus(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type ReadinessStage = "manifest" | "route" | "permissions" | "preview" | "registry";

const READINESS_STAGE_BY_KEY: Record<string, ReadinessStage> = {
  prd_baseline: "manifest",
  active_frontend: "preview",
  app_roles: "permissions",
  app_owner: "permissions",
  blocking_guardrail: "registry"
};

const READINESS_LABEL_BY_KEY: Record<string, string> = {
  prd_baseline: "PRD baseline",
  active_frontend: "Active frontend checkpoint",
  app_roles: "App roles",
  app_owner: "Project owner",
  blocking_guardrail: "Publish guardrail"
};

export function PublishPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    accessLoadState,
    clearPublishSubdomainError,
    handlePublishProject,
    isPublishingProject,
    publishMessage,
    publishMessageTechnicalDetails,
    publishMessageTone,
    publishSubdomainError,
    publishReadinessState,
    publishResult,
    publishReview,
    refreshCreatorPublishState,
    selectedProject,
    visibleDeployment,
    visiblePreview,
    visibleRegistryEntry
  } = app;
  const suggestedSubdomain = normalizeSubdomainSuggestion(
    selectedProject.name,
    selectedProject.id.replaceAll("_", "-")
  );
  const [subdomain, setSubdomain] = useState(suggestedSubdomain);
  const [visibility, setVisibility] = useState<"public" | "restricted">(
    visibleRegistryEntry?.visibility === "public" ? "public" : "restricted"
  );
  const visibilityTouchedRef = useRef(false);
  const subdomainInputRef = useRef<HTMLInputElement>(null);
  const previousProjectIdRef = useRef(selectedProject.id);
  useEffect(() => {
    if (previousProjectIdRef.current === selectedProject.id) return;
    previousProjectIdRef.current = selectedProject.id;
    visibilityTouchedRef.current = false;
    setVisibility(visibleRegistryEntry?.visibility === "public" ? "public" : "restricted");
    setSubdomain(
      normalizeSubdomainSuggestion(selectedProject.name, selectedProject.id.replaceAll("_", "-"))
    );
    clearPublishSubdomainError();
  }, [clearPublishSubdomainError, selectedProject.id, selectedProject.name, visibleRegistryEntry]);
  useEffect(() => {
    if (!visibilityTouchedRef.current && visibleRegistryEntry?.projectId === selectedProject.id) {
      setVisibility(visibleRegistryEntry.visibility === "public" ? "public" : "restricted");
    }
  }, [selectedProject.id, visibleRegistryEntry]);
  useEffect(() => {
    if (publishSubdomainError) subdomainInputRef.current?.focus();
  }, [publishSubdomainError]);
  const subdomainValidation = validateSubdomainLabel(subdomain);
  const subdomainError = subdomainValidation.ok
    ? publishSubdomainError
    : subdomainValidation.message;
  const previewUrl = publishReview?.accessUrlConfig
    ? buildSubdomainUrl(subdomain, publishReview.accessUrlConfig)
    : "";
  const manifest = publishReview?.manifest ?? publishResult?.manifest;
  const resolvedAccessState = accessLoadState ?? (publishReview ? "ready" : "loading");
  const accessReady = resolvedAccessState === "ready";
  const resolvedReadinessState =
    publishReadinessState ??
    (resolvedAccessState === "loading"
      ? "loading"
      : resolvedAccessState === "unavailable" || !publishReview
        ? "unavailable"
        : "ready");
  const readinessAvailable =
    resolvedReadinessState === "ready" && accessReady && Boolean(publishReview);
  const stageBlockers: Record<ReadinessStage, string[]> = {
    manifest: [],
    route: [],
    permissions: [],
    preview: [],
    registry: []
  };
  const failedChecklist = publishReview?.checklist.filter((item) => item.status === "fail") ?? [];
  for (const item of failedChecklist) {
    const stage = READINESS_STAGE_BY_KEY[item.key] ?? "registry";
    stageBlockers[stage].push(READINESS_LABEL_BY_KEY[item.key] ?? "Additional publish requirement");
  }
  if (publishReview && !publishReview.ready && failedChecklist.length === 0) {
    stageBlockers.registry.push("Additional publish requirement");
  }
  const failedChecks = Object.values(stageBlockers).flat();
  const manifestVersion = manifest?.manifestVersion;
  const route = manifest?.app?.route;
  const permissionsReady =
    readinessAvailable &&
    Boolean(manifest?.auth?.mode) &&
    Boolean(manifest?.roles?.length) &&
    stageBlockers.permissions.length === 0;
  const previewReady =
    readinessAvailable &&
    Boolean(manifest?.frontend?.checkpointId || visiblePreview.id) &&
    stageBlockers.preview.length === 0;
  const registryReady = readinessAvailable && stageBlockers.registry.length === 0;
  const unavailableDetail =
    resolvedReadinessState === "loading"
      ? "Waiting for access and publish information."
      : "Readiness information is currently unavailable.";
  const readinessSteps = [
    {
      label: "Manifest",
      ready: readinessAvailable && Boolean(manifestVersion) && stageBlockers.manifest.length === 0,
      detail: readinessAvailable
        ? stageBlockers.manifest.length
          ? `Resolve: ${stageBlockers.manifest.join(", ")}.`
          : manifestVersion
            ? `Version ${manifestVersion}`
            : "Generate a manifest before publishing."
        : unavailableDetail,
      icon: FileCheck2
    },
    {
      label: "Route",
      ready: readinessAvailable && Boolean(route) && stageBlockers.route.length === 0,
      detail: readinessAvailable
        ? route || "Configure an application route before publishing."
        : unavailableDetail,
      icon: Link2
    },
    {
      label: "Permissions",
      ready: permissionsReady,
      detail: readinessAvailable
        ? stageBlockers.permissions.length
          ? `Resolve: ${stageBlockers.permissions.join(", ")}.`
          : permissionsReady
            ? "Access roles and ownership are configured."
            : "Resolve access requirements before publishing."
        : unavailableDetail,
      icon: LockKeyhole
    },
    {
      label: "Preview",
      ready: previewReady,
      detail: readinessAvailable
        ? stageBlockers.preview.length
          ? `Resolve: ${stageBlockers.preview.join(", ")}.`
          : previewReady
            ? `Frontend ${manifest?.frontend?.version ?? visiblePreview.version} is available.`
            : "Generate or restore an active frontend preview."
        : unavailableDetail,
      icon: MonitorCheck
    },
    {
      label: "Registry",
      ready: registryReady,
      detail: readinessAvailable
        ? stageBlockers.registry.length
          ? `Resolve: ${stageBlockers.registry.join(", ")}.`
          : visibleRegistryEntry
            ? `Registry entry ${visibleRegistryEntry.slug} is available.`
            : "The registry entry will be created during publish."
        : unavailableDetail,
      icon: Store
    }
  ];
  const canPublish =
    readinessAvailable &&
    publishReview?.ready === true &&
    readinessSteps.every((step) => step.ready);
  const canSubmitPublish = canPublish && subdomainValidation.ok && !publishSubdomainError;
  const blockerSummary =
    resolvedReadinessState === "loading"
      ? "Publish readiness is loading. Wait for the latest access information before publishing."
      : resolvedReadinessState === "unavailable" || !publishReview
        ? "Publish readiness is unavailable. Retry loading access and publish information."
        : failedChecks.length
          ? `Resolve ${failedChecks.length} readiness ${failedChecks.length === 1 ? "requirement" : "requirements"} before publishing.`
          : "Resolve the remaining readiness requirements before publishing.";
  const statusTone =
    resolvedReadinessState === "loading"
      ? "info"
      : !canPublish
        ? "warning"
        : publishMessageTone === "danger"
          ? "danger"
          : "success";
  const statusTechnicalDetails =
    resolvedReadinessState === "unavailable" || (canPublish && publishMessageTone === "danger")
      ? publishMessageTechnicalDetails
      : undefined;

  return (
    <CreatorShell
      app={app}
      content={
        <section className="creator-publish-layout" aria-label="Publish app">
          <PublishAccessUrlCard
            value={subdomain}
            previewUrl={previewUrl}
            visibility={visibility}
            error={subdomainError}
            disabled={isPublishingProject}
            inputRef={subdomainInputRef}
            onChange={(value) => {
              setSubdomain(value);
              clearPublishSubdomainError();
            }}
            onVisibilityChange={(value) => {
              visibilityTouchedRef.current = true;
              setVisibility(value);
            }}
          />

          <SectionCard
            eyebrow="Readiness"
            title="Publish readiness"
            action={
              <Button
                type="button"
                className="creator-publish-action"
                variant={canSubmitPublish ? "primary" : "secondary"}
                onClick={() => handlePublishProject({ subdomain, visibility })}
                disabled={isPublishingProject || !canSubmitPublish}
                aria-busy={isPublishingProject || undefined}
              >
                <Store size={16} aria-hidden="true" />
                {isPublishingProject ? "Publishing…" : "Publish to App Store"}
              </Button>
            }
          >
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

            <CreatorStatusMessage tone={statusTone} technicalDetails={statusTechnicalDetails}>
              {canPublish ? (
                publishMessageTone === "danger" || publishResult ? (
                  publishMessage
                ) : (
                  "All readiness requirements are complete. This project can be published."
                )
              ) : (
                <>
                  <strong>{blockerSummary}</strong>
                  {failedChecks.length ? (
                    <span className="creator-publish-blocker-list">{failedChecks.join(", ")}</span>
                  ) : null}
                  {resolvedReadinessState === "unavailable" ? (
                    <span className="creator-publish-retry">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          void refreshCreatorPublishState(selectedProject.id).catch(
                            () => undefined
                          );
                        }}
                      >
                        Retry readiness
                      </Button>
                    </span>
                  ) : null}
                </>
              )}
            </CreatorStatusMessage>
          </SectionCard>

          <SectionCard eyebrow="Published output" title="Latest deployment">
            {visibleDeployment ? (
              <div className="creator-published-output">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <strong>{readableStatus(visibleDeployment.status)}</strong>
                  <span>
                    {readableStatus(visibleDeployment.environment)} · Manifest version{" "}
                    {visibleDeployment.manifestVersion}
                  </span>
                  <small title={visibleDeployment.id}>Deployment {visibleDeployment.id}</small>
                  {visibleDeployment.subdomainUrl ? (
                    <span className="creator-published-url">
                      <strong>Primary access URL</strong>
                      <a
                        href={visibleDeployment.subdomainUrl}
                        title={visibleDeployment.subdomainUrl}
                      >
                        {visibleDeployment.subdomainUrl}
                      </a>
                    </span>
                  ) : null}
                  {visibleDeployment.route ? (
                    <span className="creator-published-url">
                      <strong>Fallback path</strong>
                      <a href={visibleDeployment.route} title={visibleDeployment.route}>
                        {visibleDeployment.route}
                      </a>
                    </span>
                  ) : null}
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
