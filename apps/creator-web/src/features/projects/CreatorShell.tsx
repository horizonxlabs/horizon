import { AppShell, PageHeader } from "@evcp/ui";
import type { ReactNode } from "react";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { CreateProjectWizard } from "./CreateProjectWizard";
import type { useCreatorApp } from "@/app/use-creator-app";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { WorkspaceWakeOverlay } from "@/features/workspace";

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
    createProjectTechnicalDetails,
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
      {isEnteringWorkspace ? <WorkspaceWakeOverlay projectId={selectedProject.id} /> : null}
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
          technicalDetails={createProjectTechnicalDetails}
          isCreating={isCreatingProject}
        />
      ) : null}
      {content}
    </AppShell>
  );
}
