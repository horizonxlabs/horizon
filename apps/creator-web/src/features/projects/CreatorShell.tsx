import { AppShell, PageHeader } from "@evcp/ui";
import type { ReactNode } from "react";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { CreateProjectWizard } from "./CreateProjectWizard";
import type { useCreatorApp } from "@/app/use-creator-app";
import { ProjectSwitcher } from "./ProjectSwitcher";

export function CreatorShell({
  app,
  content
}: {
  app: ReturnType<typeof useCreatorApp>;
  content: ReactNode;
}) {
  const {
    creatorNavItems,
    bootstrap,
    creatorSessionControls,
    creatorPage,
    pageCopy,
    selectedProject,
    creatorPageActions,
    isCreateProjectDialogOpen,
    setIsCreateProjectDialogOpen,
    handleCreateProjectSubmit,
    isCreatingProject,
    createProjectForm,
    handleCreateProjectField,
    createProjectMessage,
    isEnteringWorkspace,
    handleSelectProject,
    onNavigate,
    pathname
  } = app;
  return (
    <AppShell
      title="Horizon"
      logo={<HorizonLogo />}
      sidebarContext={
        <ProjectSwitcher
          projects={bootstrap.projects}
          selectedProject={selectedProject}
          onSelectProject={(project) => {
            // Project selection only changes Creator context. Navigation happens only when a
            // sidebar item is clicked, so the picker never redirects to a workspace URL.
            void handleSelectProject(project, app.creatorPage, { push: false });
          }}
          onCreateProject={() => setIsCreateProjectDialogOpen(true)}
        />
      }
      navItems={creatorNavItems}
      userName={bootstrap.userName}
      session={creatorSessionControls}
      tone="light"
      currentPath={pathname}
      onNavigate={onNavigate}
    >
      {isEnteringWorkspace ? (
        <div className="hz-loading-backdrop" role="status" aria-live="polite">
          <div className="hz-loading-card">
            <span className="hz-spinner" aria-hidden="true" />
            <strong>Starting workspace</strong>
            <span>Starting this project's sandbox container. This may take a moment.</span>
          </div>
        </div>
      ) : null}
      {creatorPage === "workspace" || creatorPage === "projects" ? null : (
        <PageHeader
          tone="surface"
          eyebrow={pageCopy.eyebrow}
          title={pageCopy.title.replace("Leave Management", selectedProject.name)}
          description={pageCopy.description}
          actions={creatorPageActions}
        />
      )}
      {isCreateProjectDialogOpen ? (
        <CreateProjectWizard
          form={createProjectForm}
          onField={handleCreateProjectField}
          onSubmit={handleCreateProjectSubmit}
          onClose={() => setIsCreateProjectDialogOpen(false)}
          message={createProjectMessage}
          isCreating={isCreatingProject}
        />
      ) : null}
      {content}
    </AppShell>
  );
}
