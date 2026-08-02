import { DataTable, DecisionPanel, SectionCard } from "@evcp/ui";
import { RotateCcw } from "lucide-react";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { useDeployments } from "./use-deployments";

export function DeploymentsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const deployments = useDeployments(app.selectedProject.id);
  const rows = deployments.deployments.map((deployment) => ({
    environment: deployment.environment,
    commit: deployment.commitSha,
    health: deployment.healthStatus,
    timestamp: deployment.createdAt
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
              <button
                type="button"
                className="ghost-button"
                onClick={() => void deployments.refresh()}
                disabled={deployments.status === "loading"}
              >
                <RotateCcw size={14} /> Refresh
              </button>
            }
          >
            <p role="status">{deployments.message}</p>
            {rows.length ? (
              <DataTable
                columns={[
                  { key: "environment", label: "Environment" },
                  { key: "commit", label: "Commit" },
                  {
                    key: "health",
                    label: "Health",
                    tone: (value) =>
                      value === "healthy" ? "success" : value === "failed" ? "danger" : "warning"
                  },
                  { key: "timestamp", label: "Timestamp" }
                ]}
                rows={rows}
              />
            ) : (
              <DecisionPanel
                tone={deployments.status === "error" ? "warning" : "info"}
                badge={deployments.status === "error" ? "Platform API unavailable" : "No records"}
                title="No deployment evidence available"
                lines={["No local or demo deployment records are shown."]}
              />
            )}
          </SectionCard>
        </section>
      }
    />
  );
}
