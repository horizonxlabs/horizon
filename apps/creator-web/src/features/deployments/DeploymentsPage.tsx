import { Button, DataTable, SectionCard } from "@evcp/ui";
import { RotateCcw } from "lucide-react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { creatorPathForPage } from "@/app/routes";
import { CreatorShell } from "@/features/projects";
import { CreatorState } from "@/shared";
import { useDeployments, type DeploymentsClient } from "./use-deployments";

const deploymentDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

function readableDeploymentLabel(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatDeploymentDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : deploymentDate.format(date);
}

export function DeploymentsPage({
  app,
  client
}: {
  app: ReturnType<typeof useCreatorApp>;
  client?: DeploymentsClient;
}) {
  const deployments = useDeployments(app.selectedProject.id, client);
  const rows = deployments.deployments.map((deployment) => ({
    environment: readableDeploymentLabel(deployment.environment),
    version: deployment.imageTag,
    commit: deployment.commitSha,
    status: readableDeploymentLabel(deployment.healthStatus),
    deployed: formatDeploymentDate(deployment.createdAt)
  }));

  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Project deployments">
          <SectionCard
            eyebrow="Deployment Evidence"
            title={`Deployments: ${app.selectedProject.name}`}
            action={
              <Button
                type="button"
                variant="ghost"
                className="max-md:min-h-11"
                onClick={() => void deployments.refresh()}
                disabled={deployments.status === "loading"}
              >
                <RotateCcw size={14} /> Refresh
              </Button>
            }
          >
            {deployments.status === "loading" ? (
              <CreatorState kind="loading" title="Loading deployments" />
            ) : deployments.status === "error" ? (
              <CreatorState
                kind="unavailable"
                title="Deployments could not be loaded"
                description="Existing deployment records are unchanged."
                action={
                  <Button variant="secondary" onClick={() => void deployments.refresh()}>
                    Retry
                  </Button>
                }
                technicalDetails={deployments.message}
              />
            ) : rows.length ? (
              <DataTable
                ariaLabel="Project deployments"
                columns={[
                  { key: "environment", label: "Environment" },
                  { key: "version", label: "Version / Image" },
                  { key: "commit", label: "Commit" },
                  {
                    key: "status",
                    label: "Status",
                    tone: (value) =>
                      value === "Healthy" ? "success" : value === "Failed" ? "danger" : "warning"
                  },
                  { key: "deployed", label: "Deployed" }
                ]}
                rows={rows}
              />
            ) : (
              <CreatorState
                kind="empty"
                title="No deployments yet"
                description="Publish this project to create its first deployment record."
                action={
                  <Button
                    variant="primary"
                    onClick={() =>
                      app.onNavigate(creatorPathForPage(app.selectedProject.id, "publish"))
                    }
                  >
                    Go to Publish
                  </Button>
                }
              />
            )}
          </SectionCard>
        </section>
      }
    />
  );
}
