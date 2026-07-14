import { DecisionPanel, SectionCard } from "@evcp/ui";
import { CreatorShell } from "@/features/projects";
import type { useCreatorApp } from "@/app/use-creator-app";

export function DefaultPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  return (
    <CreatorShell
      app={app}
      content={
        <section className="admin-page-stack" aria-label="Creator workspace">
          <SectionCard eyebrow="Creator" title="Choose a project workspace">
            <DecisionPanel
              tone="info"
              badge="API-backed"
              title="This route has no dashboard fallback"
              lines={[
                "Open Projects to select a project.",
                "Workspace, PRD, access, publish, database, and ticket data are loaded only from Platform API."
              ]}
            />
          </SectionCard>
        </section>
      }
    />
  );
}
