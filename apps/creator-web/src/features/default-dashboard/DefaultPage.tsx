import { AppShell, PageHeader } from "@evcp/ui";
import { GitBranch, WandSparkles } from "lucide-react";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { DefaultDatabaseVersionsSection } from "./default/DefaultDatabaseVersionsSection";
import { DefaultProjectsPrdSection } from "./default/DefaultProjectsPrdSection";
import { DefaultTicketsTraceSection } from "./default/DefaultTicketsTraceSection";
import { DefaultUsersPublishSection } from "./default/DefaultUsersPublishSection";
import { DefaultWorkspaceSection } from "./default/DefaultWorkspaceSection";
import type { useCreatorApp } from "@/app/use-creator-app";

export function DefaultPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const {
    creatorNavItems,
    bootstrap,
    creatorSessionControls,
    pageCopy,
    selectedProject,
    creatorPage
  } = app;
  return (
    <AppShell
      title="Horizon"
      logo={<HorizonLogo />}
      navItems={creatorNavItems}
      userName={bootstrap.userName}
      session={creatorSessionControls}
    >
      <PageHeader
        tone="surface"
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title.replace("Leave Management", selectedProject.name)}
        description={pageCopy.description}
        actions={
          <>
            <button type="button" className="secondary-button">
              <GitBranch size={16} />
              Remix
            </button>
            <button type="button">
              <WandSparkles size={16} />
              Create Project Wizard
            </button>
          </>
        }
      />

      <div className={`creator-route-scope creator-route-${creatorPage}`}>
        <DefaultWorkspaceSection app={app} />
        <DefaultDatabaseVersionsSection />
        <DefaultUsersPublishSection app={app} />
        <DefaultTicketsTraceSection />
        <DefaultProjectsPrdSection app={app} />
      </div>
    </AppShell>
  );
}
