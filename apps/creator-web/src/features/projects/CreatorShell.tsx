import { AppShell, DecisionPanel, PageHeader, Select } from "@evcp/ui";
import { WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import { HorizonLogo } from "@/shared/HorizonLogo";
import type { useCreatorApp } from "@/app/use-creator-app";

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
    isEnteringWorkspace
  } = app;
  return (
    <AppShell
      title="Horizon"
      logo={<HorizonLogo />}
      navItems={creatorNavItems}
      userName={bootstrap.userName}
      session={creatorSessionControls}
      tone="light"
    >
      {isEnteringWorkspace ? (
        <div className="hz-loading-backdrop" role="status" aria-live="polite">
          <div className="hz-loading-card">
            <span className="hz-spinner" aria-hidden="true" />
            <strong>กำลังเริ่ม workspace</strong>
            <span>กำลัง start sandbox/container ของโปรเจกต์ — อาจใช้เวลาสักครู่</span>
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
        <div className="creator-dialog-backdrop" role="presentation">
          <form
            className="creator-project-dialog"
            onSubmit={handleCreateProjectSubmit}
            aria-label="Create project wizard"
          >
            <header>
              <div>
                <span className="eyebrow">Create Project Wizard</span>
                <h2>สร้าง Project ใหม่</h2>
                <p>ระบบจะสร้าง project, เรียก governed AI route และสร้าง PRD draft แรกให้ทันที</p>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setIsCreateProjectDialogOpen(false)}
                disabled={isCreatingProject}
              >
                Close
              </button>
            </header>
            <div className="creator-project-form">
              <label>
                Project name
                <input
                  required
                  value={createProjectForm.name}
                  onChange={(event) => handleCreateProjectField("name", event.target.value)}
                />
              </label>
              <label>
                App type
                <input
                  value={createProjectForm.appType}
                  onChange={(event) => handleCreateProjectField("appType", event.target.value)}
                />
              </label>
              <label>
                Target department
                <input
                  value={createProjectForm.targetDepartment}
                  onChange={(event) =>
                    handleCreateProjectField("targetDepartment", event.target.value)
                  }
                />
              </label>
              <label className="creator-project-form-wide">
                Business problem
                <textarea
                  required
                  value={createProjectForm.businessProblem}
                  onChange={(event) =>
                    handleCreateProjectField("businessProblem", event.target.value)
                  }
                />
              </label>
              <label>
                Intended users
                <input
                  value={createProjectForm.intendedUsers}
                  onChange={(event) =>
                    handleCreateProjectField("intendedUsers", event.target.value)
                  }
                />
              </label>
              <label>
                Data sensitivity
                <Select
                  value={createProjectForm.dataSensitivity}
                  onChange={(event) =>
                    handleCreateProjectField("dataSensitivity", event.target.value)
                  }
                >
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                  <option value="public">Public</option>
                </Select>
              </label>
            </div>
            <DecisionPanel
              tone={createProjectMessage.includes("failed") ? "danger" : "info"}
              badge={isCreatingProject ? "Creating" : "Ready"}
              title={createProjectMessage}
              lines={[
                "POST /projects",
                "POST /projects/{projectId}/prd/generate",
                "Refresh project list and select the new project"
              ]}
            />
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsCreateProjectDialogOpen(false)}
                disabled={isCreatingProject}
              >
                Cancel
              </button>
              <button type="submit" disabled={isCreatingProject}>
                <WandSparkles size={16} />
                {isCreatingProject ? "Creating Project" : "Create Project + Generate PRD"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {content}
    </AppShell>
  );
}
