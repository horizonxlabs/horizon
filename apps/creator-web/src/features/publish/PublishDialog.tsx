import { type WorkspaceDeploymentDto } from "@evcp/api-client";
import { Button } from "@evcp/ui";
import { ArrowUpRight, ExternalLink, Globe, Rocket, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import { CreatorStatusMessage, type CreatorStatusTone } from "@/shared";
import { deploymentUrl } from "./deployment-url";

type TargetEnv = "staging" | "production";
type PublishDialogClient = Pick<
  ReturnType<typeof createCreatorPlatformClient>,
  "listDeployments" | "promoteDeployment" | "publishProject"
>;

const ENVIRONMENTS: Array<{ value: TargetEnv; label: string; hint: string }> = [
  { value: "staging", label: "Staging", hint: "Test build before going live" },
  { value: "production", label: "Production", hint: "Live app your users see" }
];

function latestFor(
  deployments: WorkspaceDeploymentDto[],
  environment: TargetEnv
): WorkspaceDeploymentDto | undefined {
  return deployments
    .filter((deployment) => deployment.environment === environment)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function healthLabel(deployment: WorkspaceDeploymentDto | undefined): string {
  if (!deployment) return "Not deployed";
  return `${deployment.commitSha.slice(0, 7)} · ${deployment.healthStatus}`;
}

function technicalDetails(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function PublishDialog({
  projectId,
  onClose,
  client
}: {
  projectId: string;
  onClose: () => void;
  client?: PublishDialogClient;
}) {
  const platformClient = useMemo(() => client ?? createCreatorPlatformClient(), [client]);
  const [deployments, setDeployments] = useState<WorkspaceDeploymentDto[]>([]);
  const [target, setTarget] = useState<TargetEnv>("staging");
  const [busyAction, setBusyAction] = useState<"deploy" | "promote" | undefined>(undefined);
  const [feedback, setFeedback] = useState<
    { message: string; tone: CreatorStatusTone; technicalDetails?: string } | undefined
  >(undefined);

  const refresh = useCallback(async () => {
    try {
      setDeployments(await platformClient.listDeployments(projectId));
      return undefined;
    } catch (error) {
      return technicalDetails(error);
    }
  }, [platformClient, projectId]);

  useEffect(() => {
    void refresh().then((details) => {
      if (!details) return;
      setFeedback({
        message: "Deployment history could not be loaded. You can still deploy a new build.",
        tone: "warning",
        technicalDetails: details
      });
    });
  }, [refresh]);

  const staging = latestFor(deployments, "staging");
  const isBusy = busyAction !== undefined;

  async function handleDeploy() {
    setBusyAction("deploy");
    setFeedback(undefined);
    try {
      const result = await platformClient.publishProject(projectId, target);
      const refreshError = await refresh();
      setFeedback({
        message: refreshError
          ? `Deployed to ${target}, but deployment history could not be refreshed.`
          : `Deployed to ${target} · ${result.deployment.healthStatus}`,
        tone: refreshError ? "warning" : "success",
        technicalDetails: refreshError
      });
    } catch (error) {
      setFeedback({
        message: "Deployment could not be completed. Existing deployments are unchanged.",
        tone: "danger",
        technicalDetails: technicalDetails(error)
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  async function handlePromote() {
    setBusyAction("promote");
    setFeedback(undefined);
    try {
      const result = await platformClient.promoteDeployment(projectId);
      const refreshError = await refresh();
      setFeedback({
        message: refreshError
          ? "Promoted to production, but deployment history could not be refreshed."
          : `Promoted to production · ${result.deployment.healthStatus}`,
        tone: refreshError ? "warning" : "success",
        technicalDetails: refreshError
      });
    } catch (error) {
      setFeedback({
        message: "Promotion could not be completed. The staging deployment is unchanged.",
        tone: "danger",
        technicalDetails: technicalDetails(error)
      });
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <div
      className="publish-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Publish"
      onClick={onClose}
    >
      <div className="publish-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="publish-dialog-head">
          <div>
            <strong>Publish</strong>
            <span>Deploy this build to an environment</span>
          </div>
          <button
            type="button"
            className="publish-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="env-selector" role="radiogroup" aria-label="Target environment">
          {ENVIRONMENTS.map((environment) => {
            const current = latestFor(deployments, environment.value);
            const selected = target === environment.value;
            const url =
              current && current.healthStatus === "healthy"
                ? deploymentUrl(current.slug, environment.value)
                : undefined;
            return (
              <div className="env-option-wrap" key={environment.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`env-option ${selected ? "is-selected" : ""}`.trim()}
                  onClick={() => setTarget(environment.value)}
                >
                  <span className="env-option-radio" aria-hidden="true" />
                  <span className="env-option-body">
                    <strong>{environment.label}</strong>
                    <small>{environment.hint}</small>
                  </span>
                  <span className={`env-option-status status-${current?.healthStatus ?? "none"}`}>
                    {healthLabel(current)}
                  </span>
                </button>
                {url ? (
                  <a
                    className="env-option-url"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Globe size={12} aria-hidden="true" />
                    <span className="env-option-url-text">{url}</span>
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>

        {feedback ? (
          <CreatorStatusMessage
            tone={feedback.tone}
            technicalDetails={feedback.technicalDetails}
          >
            {feedback.message}
          </CreatorStatusMessage>
        ) : null}

        <div className="publish-dialog-actions">
          <Button type="button" onClick={() => void handleDeploy()} disabled={isBusy}>
            <Rocket size={15} aria-hidden="true" />
            {busyAction === "deploy"
              ? "Deploying…"
              : `Deploy to ${target === "staging" ? "Staging" : "Production"}`}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handlePromote()}
            disabled={isBusy || !staging || staging.healthStatus !== "healthy"}
            title={
              staging?.healthStatus === "healthy"
                ? "Promote the current staging build to production"
                : "Deploy a healthy staging build first"
            }
          >
            <ArrowUpRight size={15} aria-hidden="true" />
            {busyAction === "promote" ? "Promoting…" : "Promote Staging → Production"}
          </Button>
        </div>
      </div>
    </div>
  );
}
