import { lazy, Suspense } from "react";
import { SectionCard } from "@evcp/ui";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";
import { CreatorState } from "@/shared";

const WorkspaceDatabasePanel = lazy(() => import("@/features/workspace/WorkspaceDatabasePanel"));

export function DatabasePage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack creator-database-page" aria-label="Project database">
          <SectionCard className="creator-database-card" title="Schema and records">
            <Suspense
              fallback={
                <CreatorState
                  kind="loading"
                  title="Loading database tools"
                  description="Preparing the project database browser."
                />
              }
            >
              <WorkspaceDatabasePanel projectId={app.selectedProject.id} />
            </Suspense>
          </SectionCard>
        </section>
      }
    />
  );
}
