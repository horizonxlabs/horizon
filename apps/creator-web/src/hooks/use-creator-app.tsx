import { type PrdVersionDto } from "@evcp/api-client";
import { FolderPlus, RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  initialCreateProjectForm,
  initialCreatorBootstrap,
  prdSections,
  versionRows
} from "../data/mock-data";
import { clearCreatorSessionBridge, createCreatorPlatformClient } from "../lib/creator-client";
import {
  createCreatorNavigation,
  creatorPageCopy,
  creatorPageFromPath
} from "../lib/routing";
import { clearLoginSession } from "../lib/session";
import type { CreateProjectFormState, CreatorPage, CreatorProjectView } from "../types";
import {
  ensureVibeWorkspace,
  loadCreatorBootstrap,
  loadPrdState,
  loadWorkspaceState,
  signInCreatorSessionBridge
} from "./creator-app-helpers";
import { usePublishAccess } from "./use-publish-access";
import { useVibeWorkspace } from "./use-vibe-workspace";

export function useCreatorApp({ onLogout }: { onLogout?: () => void }) {
  const [bootstrap, setBootstrap] = useState(initialCreatorBootstrap);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isEnteringWorkspace, setIsEnteringWorkspace] = useState(false);
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [createProjectForm, setCreateProjectForm] =
    useState<CreateProjectFormState>(initialCreateProjectForm);
  const [createProjectMessage, setCreateProjectMessage] = useState(
    "กรอกข้อมูลแอป แล้วระบบจะสร้าง project และ PRD draft ให้ทันที"
  );
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [currentPrdVersion, setCurrentPrdVersion] = useState<PrdVersionDto | undefined>(undefined);
  const [prdVersionList, setPrdVersionList] = useState<PrdVersionDto[]>([]);

  const selectedProject = bootstrap.selectedProject;
  const creatorNavItems = createCreatorNavigation(selectedProject);

  const vibeWorkspace = useVibeWorkspace({ selectedProject });
  const publishAccess = usePublishAccess({
    selectedProject,
    visiblePreviewVersion: vibeWorkspace.visiblePreview.version
  });

  const visiblePrdSections = currentPrdVersion?.sections?.length
    ? currentPrdVersion.sections.map((section) => ({
        key: section.key,
        title: section.title,
        body: section.body,
        order: String(section.order)
      }))
    : prdSections.map((section) => ({
        ...section,
        body: section.body.replaceAll("Leave Management", selectedProject.name)
      }));
  const visibleVersionRows = prdVersionList.length
    ? prdVersionList.map((version) => ({
        version: version.version,
        status: version.status,
        summary: version.changeSummary,
        author: selectedProject.owner
      }))
    : versionRows.map((row) => ({
        ...row,
        summary: row.summary.replaceAll("Leave Management", selectedProject.name),
        author: selectedProject.owner
      }));
  const creatorPage = creatorPageFromPath(window.location.pathname);
  const pageCopy = creatorPageCopy[creatorPage];

  async function refreshPrdState(projectId: string) {
    const prdState = await loadPrdState(projectId);
    setCurrentPrdVersion(prdState.current);
    setPrdVersionList(prdState.versions);
  }

  function resetProjectRuntimeState() {
    vibeWorkspace.resetWorkspace();
    publishAccess.resetPublishAccess();
    setCurrentPrdVersion(undefined);
    setPrdVersionList([]);
  }

  useEffect(() => {
    // Direct navigation / reload onto a workspace URL must also provision the sandbox container
    // (the card-click path does this via handleSelectProject; a fresh page load does not).
    const onWorkspace = creatorPage === "workspace";
    if (onWorkspace) setIsEnteringWorkspace(true);
    loadCreatorBootstrap()
      .then(async (nextBootstrap) => {
        setBootstrap(nextBootstrap);
        try {
          await refreshPrdState(nextBootstrap.selectedProject.id);
        } catch {
          setCurrentPrdVersion(undefined);
          setPrdVersionList([]);
        }
        try {
          if (onWorkspace) {
            await ensureVibeWorkspace(nextBootstrap.selectedProject.id);
          }
          vibeWorkspace.setWorkspaceSnapshot(
            await loadWorkspaceState(nextBootstrap.selectedProject.id)
          );
          await publishAccess.refreshCreatorPublishState(nextBootstrap.selectedProject.id);
          vibeWorkspace.setWorkspaceMessage("Workspace snapshot loaded from Platform API.");
        } catch {
          vibeWorkspace.setWorkspaceSnapshot(undefined);
          vibeWorkspace.setWorkspaceMessage(
            "Signed in. Confirm PRD baseline before workspace generation."
          );
        }
      })
      .catch(() => {
        setBootstrap(initialCreatorBootstrap);
        vibeWorkspace.setWorkspaceSnapshot(undefined);
      })
      .finally(() => {
        setIsSigningIn(false);
        if (onWorkspace) setIsEnteringWorkspace(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignInBridge() {
    setIsSigningIn(true);
    try {
      const nextBootstrap = await signInCreatorSessionBridge();
      setBootstrap(nextBootstrap);
      try {
        await refreshPrdState(nextBootstrap.selectedProject.id);
      } catch {
        setCurrentPrdVersion(undefined);
        setPrdVersionList([]);
      }
      try {
        vibeWorkspace.setWorkspaceSnapshot(
          await loadWorkspaceState(nextBootstrap.selectedProject.id)
        );
        await publishAccess.refreshCreatorPublishState(nextBootstrap.selectedProject.id);
        vibeWorkspace.setWorkspaceMessage("Workspace snapshot loaded from Platform API.");
      } catch {
        vibeWorkspace.setWorkspaceSnapshot(undefined);
        vibeWorkspace.setWorkspaceMessage(
          "Signed in. Confirm PRD baseline before workspace generation."
        );
      }
    } catch {
      setBootstrap(initialCreatorBootstrap);
      vibeWorkspace.setWorkspaceSnapshot(undefined);
    } finally {
      setIsSigningIn(false);
    }
  }

  function handleLogoutBridge() {
    setBootstrap(clearCreatorSessionBridge());
    resetProjectRuntimeState();
    vibeWorkspace.setWorkspaceMessage(
      "Using deterministic local workspace evidence until the Platform API is configured."
    );
    publishAccess.setPublishMessage(
      "Using deterministic local publish evidence until the Platform API is configured."
    );
    clearLoginSession();
    onLogout?.();
  }

  function handleCreateProjectField(field: keyof CreateProjectFormState, value: string) {
    setCreateProjectForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSelectProject(
    project: CreatorProjectView,
    targetPage: CreatorPage = creatorPage
  ) {
    setBootstrap((current) => ({ ...current, selectedProject: project }));
    resetProjectRuntimeState();
    const routeBase = `/creator/projects/${project.id}`;
    const routeByPage: Record<CreatorPage, string> = {
      projects: "/creator/",
      workspace: routeBase,
      prd: `${routeBase}/prd`,
      users: `${routeBase}/users`,
      publish: `${routeBase}/publish`,
      tickets: `${routeBase}/tickets`
    };
    window.history.pushState({}, "", routeByPage[targetPage]);
    // Entering the workspace provisions/starts the project's sandbox container, which can take a
    // few seconds. Show a blocking loading modal until it is ready (see isEnteringWorkspace).
    const enteringWorkspace = targetPage === "workspace";
    if (enteringWorkspace) setIsEnteringWorkspace(true);
    try {
      try {
        await refreshPrdState(project.id);
      } catch {
        setCurrentPrdVersion(undefined);
        setPrdVersionList([]);
      }
      try {
        if (enteringWorkspace) {
          await ensureVibeWorkspace(project.id);
        }
        vibeWorkspace.setWorkspaceSnapshot(await loadWorkspaceState(project.id));
        await publishAccess.refreshCreatorPublishState(project.id);
        vibeWorkspace.setWorkspaceMessage("Workspace snapshot loaded from Platform API.");
      } catch {
        vibeWorkspace.setWorkspaceSnapshot(undefined);
        vibeWorkspace.setWorkspaceMessage(
          "Project selected. Confirm PRD baseline before workspace generation."
        );
      }
    } finally {
      if (enteringWorkspace) setIsEnteringWorkspace(false);
    }
  }

  async function handleCreateProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingProject(true);
    setCreateProjectMessage(
      "Creating project and generating the first PRD draft through the Platform API."
    );
    try {
      const client = createCreatorPlatformClient();
      const project = await client.createProject({
        name: createProjectForm.name.trim(),
        appType: createProjectForm.appType.trim() || "Workflow App",
        businessProblem: createProjectForm.businessProblem.trim(),
        targetDepartment: createProjectForm.targetDepartment.trim(),
        intendedUsers: createProjectForm.intendedUsers
          .split(",")
          .map((user) => user.trim())
          .filter(Boolean),
        dataSensitivity: createProjectForm.dataSensitivity
      });
      const draft = await client.generatePrdDraft(project.id);
      const nextBootstrap = await loadCreatorBootstrap(project.id);
      setBootstrap(nextBootstrap);
      setCurrentPrdVersion(draft);
      setPrdVersionList([draft]);
      vibeWorkspace.setWorkspaceSnapshot(undefined);
      vibeWorkspace.setWorkspaceResult(undefined);
      vibeWorkspace.setPreviewOverride(undefined);
      publishAccess.setPublishReview(undefined);
      publishAccess.setPublishResult(undefined);
      publishAccess.setRegistryEntries([]);
      setCreateProjectMessage(
        `สร้าง ${project.name} แล้ว และ PRD draft v${draft.version} พร้อม review`
      );
      setIsCreateProjectDialogOpen(false);
      window.history.pushState({}, "", `/creator/projects/${project.id}/prd`);
    } catch (error) {
      setCreateProjectMessage(
        error instanceof Error
          ? `Create project failed: ${error.message}`
          : "Create project failed. Please review required fields."
      );
    } finally {
      setIsCreatingProject(false);
    }
  }

  const creatorSessionControls = (
    <button type="button" className="secondary-button" onClick={handleLogoutBridge}>
      <RotateCcw size={16} />
      Logout
    </button>
  );
  const creatorPageActions =
    creatorPage === "projects" ? (
      <button type="button" onClick={() => setIsCreateProjectDialogOpen(true)}>
        <FolderPlus size={16} />
        Create Project Wizard
      </button>
    ) : undefined;

  return {
    bootstrap,
    setBootstrap,
    isSigningIn,
    isEnteringWorkspace,
    isCreateProjectDialogOpen,
    setIsCreateProjectDialogOpen,
    createProjectForm,
    createProjectMessage,
    isCreatingProject,
    currentPrdVersion,
    prdVersionList,
    selectedProject,
    creatorNavItems,
    visiblePrdSections,
    visibleVersionRows,
    creatorPage,
    pageCopy,
    refreshPrdState,
    handleSignInBridge,
    handleLogoutBridge,
    handleCreateProjectField,
    handleSelectProject,
    handleCreateProjectSubmit,
    creatorSessionControls,
    creatorPageActions,
    ...vibeWorkspace,
    ...publishAccess
  };
}
