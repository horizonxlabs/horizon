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
  const pageTitle = pageCopy.title.replace("Leave Management", selectedProject.name);
  const pageEyebrow = pageCopy.eyebrow === pageCopy.title ? undefined : pageCopy.eyebrow;
  return (
    <AppShell
      title="Horizon"
      logo={<HorizonLogo className="creator-sidebar-logo" />}
      sidebarContext={
        <ProjectSwitcher
          projects={bootstrap.projects}
          selectedProject={selectedProject}
          currentPage={creatorPage}
          onSelectProject={(project, targetPage) => {
            void handleSelectProject(project, targetPage);
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
            <strong>Preparing workspace</strong>
            <span>Starting this project's sandbox. This may take a moment.</span>
          </div>
        </div>
      ) : null}
      {creatorPage === "workspace" || creatorPage === "projects" ? null : (
        <PageHeader
          tone="surface"
          eyebrow={pageEyebrow}
          title={pageTitle}
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
