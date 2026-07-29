import { type PrdVersionDto } from "@evcp/api-client";
import { navigateBrowserPath, useBrowserPath, usePageHeadingFocus } from "@evcp/ui";
import { RotateCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { initialCreateProjectForm, initialCreatorBootstrap } from "@/app/creator-defaults";
import {
  creatorApiFailureState,
  beginCreatorKeycloakLogout,
  loadCreatorBootstrap,
  loadPrdState,
  signInCreatorSessionBridge
} from "@/app/creator-app-helpers";
import { clearCreatorSessionBridge, createCreatorPlatformClient } from "@/shared/creator-client";
import {
  createCreatorNavigation,
  creatorPathForPage,
  creatorPageCopy,
  creatorRouteFromPath,
  projectRouteSegmentFromPath,
  type CreatorPage,
  type CreatorSelectablePage
} from "@/app/routes";
import { clearLoginSession } from "@/shared/session";
import type { CreateProjectFormState, CreatorProjectView } from "@/shared/types";
import { usePublishAccess } from "@/features/publish";
import { ensureVibeWorkspace, loadWorkspaceState, useVibeWorkspace } from "@/features/workspace";

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
  const [prdMessage, setPrdMessage] = useState("Loading PRD state from Platform API.");

  const selectedProject = bootstrap.selectedProject;
  const creatorNavItems = createCreatorNavigation(selectedProject);
  const pathname = useBrowserPath();
  usePageHeadingFocus(pathname);
  const creatorRoute = creatorRouteFromPath(pathname);
  const creatorPage = creatorRoute.page;

  const vibeWorkspace = useVibeWorkspace({ selectedProject });
  const publishAccess = usePublishAccess({ selectedProject });

  const visiblePrdSections =
    currentPrdVersion?.sections?.map((section) => ({
      key: section.key,
      title: section.title,
      body: section.body,
      order: String(section.order)
    })) ?? [];
  const visibleVersionRows = prdVersionList.length
    ? prdVersionList.map((version) => ({
        version: version.version,
        status: version.status,
        summary: version.changeSummary,
        author: selectedProject.owner
      }))
    : [];
  const pageCopy = creatorPageCopy[creatorPage];

  async function refreshPrdState(projectId: string) {
    const prdState = await loadPrdState(projectId);
    setCurrentPrdVersion(prdState.current);
    setPrdVersionList(prdState.versions);
    setPrdMessage(
      prdState.current
        ? "PRD loaded from Platform API."
        : "No PRD version is available from Platform API yet. Generate a draft before confirming a baseline."
    );
  }

  async function handleConfirmPrdBaseline() {
    if (!selectedProject.id || !currentPrdVersion) {
      setPrdMessage("No API-backed PRD draft is available to confirm.");
      return;
    }
    try {
      const baseline = await createCreatorPlatformClient().confirmPrdBaseline(selectedProject.id, {
        versionId: currentPrdVersion.id
      });
      setCurrentPrdVersion(baseline);
      setPrdVersionList((current) => [
        baseline,
        ...current.filter((version) => version.id !== baseline.id)
      ]);
      setPrdMessage(`Baseline v${baseline.version} confirmed through Platform API.`);
    } catch (error) {
      setPrdMessage(
        error instanceof Error
          ? `Baseline confirmation failed: ${error.message}`
          : "Baseline confirmation failed. No local state was changed."
      );
    }
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
    loadCreatorBootstrap(projectRouteSegmentFromPath(pathname))
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
      .catch((error) => {
        setBootstrap(
          creatorApiFailureState(
            error instanceof Error
              ? error.message
              : "Unable to load Creator projects from Platform API."
          )
        );
        vibeWorkspace.setWorkspaceSnapshot(undefined);
      })
      .finally(() => {
        setIsSigningIn(false);
        if (onWorkspace) setIsEnteringWorkspace(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const match = creatorRoute.projectId
      ? bootstrap.projects.find((project) => project.id === creatorRoute.projectId)
      : undefined;
    if (!match || match.id === selectedProject.id) return;
    const targetPage: CreatorSelectablePage =
      creatorPage === "ticket-detail"
        ? "tickets"
        : creatorPage === "not-found"
          ? "workspace"
          : creatorPage;
    void handleSelectProject(match, targetPage, { push: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, bootstrap.projects, selectedProject.id]);

  async function handleSignInBridge() {
    setIsSigningIn(true);
    try {
      signInCreatorSessionBridge();
      return;
    } catch {
      setBootstrap(initialCreatorBootstrap);
      vibeWorkspace.setWorkspaceSnapshot(undefined);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleLogoutBridge() {
    await createCreatorPlatformClient()
      .request("/auth/logout", { method: "POST" })
      .catch(() => undefined);
    clearCreatorSessionBridge();
    setBootstrap(initialCreatorBootstrap);
    resetProjectRuntimeState();
    vibeWorkspace.setWorkspaceMessage("Signed out. Sign in again to load workspace state.");
    publishAccess.setPublishMessage("Signed out. Sign in again to load publish state.");
    clearLoginSession();
    onLogout?.();
    beginCreatorKeycloakLogout();
  }

  function handleCreateProjectField(field: keyof CreateProjectFormState, value: string) {
    setCreateProjectForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSelectProject(
    project: CreatorProjectView,
    targetPage: CreatorPage = creatorPage,
    options: { push?: boolean } = {}
  ) {
    const { push = true } = options;
    const selectableTargetPage: CreatorSelectablePage =
      targetPage === "ticket-detail"
        ? "tickets"
        : targetPage === "not-found"
          ? "workspace"
          : targetPage;
    setBootstrap((current) => ({ ...current, selectedProject: project }));
    resetProjectRuntimeState();
    if (push) {
      navigateBrowserPath(creatorPathForPage(project.id, selectableTargetPage));
    }
    // Entering the workspace provisions/starts the project's sandbox container, which can take a
    // few seconds. Show a blocking loading modal until it is ready (see isEnteringWorkspace).
    const enteringWorkspace = selectableTargetPage === "workspace";
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

  // Prompt-first flow: create a project from the home prompt box, enter its workspace, and
  // immediately submit the prompt as the first AI build.
  async function handleCreateFromPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setIsEnteringWorkspace(true);
    setCreateProjectMessage("");
    try {
      const name = trimmed.split("\n")[0]?.slice(0, 60).trim() || "Untitled App";
      const project = await createCreatorPlatformClient().createProject({
        name,
        businessProblem: trimmed
      });
      const nextBootstrap = await loadCreatorBootstrap(project.id);
      setBootstrap(nextBootstrap);
      await handleSelectProject(nextBootstrap.selectedProject, "workspace");
      // Explicit overrides: React has not re-rendered the vibe-workspace hook with the new
      // project yet, so selectedProject/promptDraft/mode in its closure are still stale.
      vibeWorkspace.setPromptDraft("");
      await vibeWorkspace.handleVibeChat({ prompt: trimmed, projectId: project.id, mode: "build" });
    } catch (error) {
      setCreateProjectMessage(
        error instanceof Error ? error.message : "สร้างโปรเจกต์ไม่สำเร็จ ลองอีกครั้ง"
      );
    } finally {
      setIsEnteringWorkspace(false);
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
      navigateBrowserPath(creatorPathForPage(project.id, "prd"));
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
  // Project creation is prompt-first (home box) — the wizard entry points are retired.
  const creatorPageActions = undefined;

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
    prdMessage,
    handleConfirmPrdBaseline,
    creatorPage,
    creatorRoute,
    pathname,
    pageCopy,
    refreshPrdState,
    handleSignInBridge,
    handleLogoutBridge,
    handleCreateProjectField,
    handleSelectProject,
    handleCreateFromPrompt,
    handleCreateProjectSubmit,
    creatorSessionControls,
    creatorPageActions,
    ...vibeWorkspace,
    ...publishAccess
  };
}
