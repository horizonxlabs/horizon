import { lazy, Suspense } from "react";
import { SectionCard } from "@evcp/ui";
import type { useCreatorApp } from "@/app/use-creator-app";
import { CreatorShell } from "@/features/projects";

const WorkspaceDatabasePanel = lazy(() => import("@/features/workspace/WorkspaceDatabasePanel"));

export function DatabasePage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Project database">
          <SectionCard eyebrow="Project Database" title={`Database: ${app.selectedProject.name}`}>
            <Suspense fallback={<p role="status">Loading database tools…</p>}>
              <WorkspaceDatabasePanel projectId={app.selectedProject.id} />
            </Suspense>
          </SectionCard>
        </section>
      }
    />
  );
}
