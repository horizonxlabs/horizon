import { type WorkspaceDeploymentDto } from "@evcp/api-client";
import { ArrowUpRight, ExternalLink, Globe, Rocket, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createCreatorPlatformClient } from "../lib/creator-client";
import { deploymentUrl } from "../lib/deployment-url";

type TargetEnv = "staging" | "production";

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
  if (!deployment) return "not deployed";
  return `${deployment.commitSha.slice(0, 7)} · ${deployment.healthStatus}`;
}

export function PublishDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [deployments, setDeployments] = useState<WorkspaceDeploymentDto[]>([]);
  const [target, setTarget] = useState<TargetEnv>("staging");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [errorText, setErrorText] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setDeployments(await createCreatorPlatformClient().listDeployments(projectId));
    } catch (error) {
      setErrorText((error as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const staging = latestFor(deployments, "staging");

  async function handleDeploy() {
    setIsBusy(true);
    setErrorText(undefined);
    setMessage(undefined);
    try {
      const result = await createCreatorPlatformClient().publishProject(projectId, target);
      setMessage(`Deployed to ${target} · ${result.deployment.healthStatus}`);
      await refresh();
    } catch (error) {
      setErrorText((error as Error).message || "Deploy failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePromote() {
    setIsBusy(true);
    setErrorText(undefined);
    setMessage(undefined);
    try {
      const result = await createCreatorPlatformClient().promoteDeployment(projectId);
      setMessage(`Promoted to production · ${result.deployment.healthStatus}`);
      await refresh();
    } catch (error) {
      setErrorText((error as Error).message || "Promote failed");
    } finally {
      setIsBusy(false);
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
            <X size={16} />
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

        {message ? <p className="publish-dialog-note is-ok">{message}</p> : null}
        {errorText ? <p className="publish-dialog-note is-error">{errorText}</p> : null}

        <div className="publish-dialog-actions">
          <button
            type="button"
            className="publish-dialog-primary"
            onClick={() => void handleDeploy()}
            disabled={isBusy}
          >
            <Rocket size={15} />
            {isBusy ? "Working…" : `Deploy to ${target === "staging" ? "Staging" : "Production"}`}
          </button>
          <button
            type="button"
            className="publish-dialog-promote"
            onClick={() => void handlePromote()}
            disabled={isBusy || !staging || staging.healthStatus !== "healthy"}
            title={
              staging?.healthStatus === "healthy"
                ? "Promote the current staging build to production"
                : "Deploy a healthy staging build first"
            }
          >
            <ArrowUpRight size={15} />
            Promote Staging → Production
          </button>
        </div>
      </div>
    </div>
  );
}
