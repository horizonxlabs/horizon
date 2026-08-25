import { navigateBrowserPath, useBrowserPath, usePageHeadingFocus } from "@evcp/ui";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  initialCreateProjectForm,
  initialCreatorBootstrap,
  unselectedProject
} from "@/app/creator-defaults";
import {
  creatorApiFailureState,
  beginCreatorKeycloakLogout,
  loadCreatorBootstrap,
  signInCreatorSessionBridge
} from "@/app/creator-app-helpers";
import { clearCreatorSessionBridge, createCreatorPlatformClient } from "@/shared/creator-client";
import {
  createCreatorNavigation,
  creatorPathForPage,
  creatorPageCopy,
  creatorRouteFromPath,
  projectSwitchTargetPage,
  projectRouteSegmentFromPath,
  type CreatorPage
} from "@/app/routes";
import { clearLoginSession } from "@/shared/session";
import type { CreateProjectFormState, CreatorProjectView } from "@/shared/types";
import { usePublishAccess } from "@/features/publish";
import { ensureVibeWorkspace, loadWorkspaceState, useVibeWorkspace } from "@/features/workspace";
import { useCreatorPrd } from "@/app/use-creator-prd";
import {
  createCreatorProjectRuntimeGuard,
  loadCreatorProjectRuntime,
  type CreatorProjectRuntimeRequest
} from "@/app/creator-project-runtime";

export function useCreatorApp({ onLogout }: { onLogout?: () => void }) {
  const [bootstrap, setBootstrap] = useState(initialCreatorBootstrap);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isEnteringWorkspace, setIsEnteringWorkspace] = useState(false);
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [createProjectForm, setCreateProjectForm] =
    useState<CreateProjectFormState>(initialCreateProjectForm);
  const [createProjectMessage, setCreateProjectMessage] = useState(
    "Complete the project details to prepare the first workspace draft."
  );
  const [createProjectTechnicalDetails, setCreateProjectTechnicalDetails] = useState<string>();
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const projectRuntimeGuardRef = useRef(createCreatorProjectRuntimeGuard());

  const selectedProject = bootstrap.selectedProject;
  const {
    currentPrdVersion,
    prdVersionList,
    prdMessage,
    prdStatus,
    prdTechnicalDetails,
    prdErrorSource,
    prdFeedbackTone,
    isGeneratingPrdDraft,
    visiblePrdSections,
    visibleVersionRows,
    refreshPrdState,
    handleConfirmPrdBaseline,
    handleGeneratePrdDraft,
    resetPrdState
  } = useCreatorPrd(selectedProject);
  const creatorNavItems = createCreatorNavigation(selectedProject);
  const pathname = useBrowserPath();
  usePageHeadingFocus(pathname);
  const creatorRoute = creatorRouteFromPath(pathname);
  const creatorPage = creatorRoute.page;
  const requestedProjectUnavailable =
    bootstrap.status === "ready" &&
    creatorPage !== "not-found" &&
    Boolean(creatorRoute.projectId) &&
    !bootstrap.projects.some((project) => project.id === creatorRoute.projectId);

  const vibeWorkspace = useVibeWorkspace({ selectedProject });
  const publishAccess = usePublishAccess({ selectedProject });

  const pageCopy = creatorPageCopy[creatorPage];

  function resetProjectRuntimeState() {
    vibeWorkspace.resetWorkspace();
    publishAccess.resetPublishAccess();
    resetPrdState();
  }

  function loadProjectRuntime(
    request: CreatorProjectRuntimeRequest,
    enteringWorkspace: boolean,
    unavailableMessage: string
  ) {
    return loadCreatorProjectRuntime({
      request,
      enteringWorkspace,
      refreshPrdState,
      ensureWorkspace: ensureVibeWorkspace,
      loadWorkspaceState,
      refreshPublishState: publishAccess.refreshCreatorPublishState,
      onWorkspaceSnapshot: vibeWorkspace.setWorkspaceSnapshot,
      onWorkspaceMessage: vibeWorkspace.setWorkspaceMessage,
      onWorkspaceUnavailable: () => {
        vibeWorkspace.setWorkspaceSnapshot(undefined);
        vibeWorkspace.setWorkspaceMessage(unavailableMessage);
      },
      onSettled: () => {
        if (enteringWorkspace) setIsEnteringWorkspace(false);
      }
    });
  }

  useEffect(() => {
    // Direct navigation / reload onto a workspace URL must also provision the sandbox container
    // (the card-click path does this via handleSelectProject; a fresh page load does not).
    const onWorkspace = creatorPage === "workspace";
    if (onWorkspace) setIsEnteringWorkspace(true);
    loadCreatorBootstrap(projectRouteSegmentFromPath(pathname))
      .then(async (nextBootstrap) => {
        setBootstrap(nextBootstrap);
        if (!nextBootstrap.selectedProject.id) {
          projectRuntimeGuardRef.current.invalidate();
          vibeWorkspace.setWorkspaceSnapshot(undefined);
          vibeWorkspace.setWorkspaceMessage(
            creatorRoute.projectId
              ? "The requested project is unavailable from Platform API."
              : "Select or create a project to load workspace state."
          );
          if (onWorkspace) setIsEnteringWorkspace(false);
          return;
        }
        const request = projectRuntimeGuardRef.current.begin(nextBootstrap.selectedProject.id);
        await loadProjectRuntime(
          request,
          onWorkspace,
          "Signed in. Confirm PRD baseline before workspace generation."
        );
      })
      .catch((error) => {
        projectRuntimeGuardRef.current.invalidate();
        setBootstrap(
          creatorApiFailureState(
            error instanceof Error
              ? error.message
              : "Unable to load Creator projects from Platform API."
          )
        );
        vibeWorkspace.setWorkspaceSnapshot(undefined);
        if (onWorkspace) setIsEnteringWorkspace(false);
      })
      .finally(() => {
        setIsSigningIn(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const match = creatorRoute.projectId
      ? bootstrap.projects.find((project) => project.id === creatorRoute.projectId)
      : undefined;
    if (!match) {
      if (creatorRoute.projectId && selectedProject.id) {
        projectRuntimeGuardRef.current.invalidate();
        setBootstrap((current) => ({ ...current, selectedProject: unselectedProject }));
        resetProjectRuntimeState();
      }
      return;
    }
    if (match.id === selectedProject.id) return;
    const targetPage = projectSwitchTargetPage(creatorPage);
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
    projectRuntimeGuardRef.current.invalidate();
    setBootstrap(initialCreatorBootstrap);
    resetProjectRuntimeState();
    vibeWorkspace.setWorkspaceMessage("Signed out. Sign in again to load workspace state.");
    publishAccess.setPublishMessage("Signed out. Sign in again to load publish state.");
    clearLoginSession();
    onLogout?.();
    beginCreatorKeycloakLogout();
  }

  function handleCreateProjectField(field: keyof CreateProjectFormState, value: string) {
    setCreateProjectTechnicalDetails(undefined);
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
    const selectableTargetPage = projectSwitchTargetPage(targetPage);
    projectRuntimeGuardRef.current.invalidate();
    setBootstrap((current) => ({ ...current, selectedProject: project }));
    resetProjectRuntimeState();
    const request = projectRuntimeGuardRef.current.begin(project.id);
    if (push) {
      navigateBrowserPath(creatorPathForPage(project.id, selectableTargetPage));
    }
    // Entering the workspace provisions/starts the project's sandbox container, which can take a
    // few seconds. Show a blocking loading modal until it is ready (see isEnteringWorkspace).
    const enteringWorkspace = selectableTargetPage === "workspace";
    if (enteringWorkspace) setIsEnteringWorkspace(true);
    await loadProjectRuntime(
      request,
      enteringWorkspace,
      "Project selected. Confirm PRD baseline before workspace generation."
    );
  }

  function handleProjectDeleted(projectId: string) {
    projectRuntimeGuardRef.current.invalidate();
    setBootstrap((current) => {
      const projects = current.projects.filter((project) => project.id !== projectId);
      return {
        ...current,
        status: projects.length ? "ready" : "empty",
        projects,
        selectedProject: unselectedProject
      };
    });
    resetProjectRuntimeState();
    navigateBrowserPath("/creator/");
  }

  // Prompt-first flow: create a project from the home prompt box, enter its workspace, and
  // immediately submit the prompt as the first AI build.
  async function handleCreateFromPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    let projectRuntimeStarted = false;
    setIsEnteringWorkspace(true);
    setCreateProjectMessage("");
    setCreateProjectTechnicalDetails(undefined);
    try {
      const name = trimmed.split("\n")[0]?.slice(0, 60).trim() || "Untitled App";
      const project = await createCreatorPlatformClient().createProject({
        name,
        businessProblem: trimmed
      });
      const nextBootstrap = await loadCreatorBootstrap(project.id);
      setBootstrap(nextBootstrap);
      projectRuntimeStarted = true;
      await handleSelectProject(nextBootstrap.selectedProject, "workspace");
      // Explicit overrides: React has not re-rendered the vibe-workspace hook with the new
      // project yet, so selectedProject/promptDraft/mode in its closure are still stale.
      vibeWorkspace.setPromptDraft("");
      await vibeWorkspace.handleVibeChat({ prompt: trimmed, projectId: project.id, mode: "build" });
    } catch (error) {
      setCreateProjectMessage("Project could not be created. Review the details and try again.");
      setCreateProjectTechnicalDetails(error instanceof Error ? error.message : String(error));
    } finally {
      // Once project runtime loading begins, only its current generation may clear this state.
      if (!projectRuntimeStarted) setIsEnteringWorkspace(false);
    }
  }

  async function handleCreateProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingProject(true);
    setCreateProjectMessage("Creating the project through the Platform API.");
    setCreateProjectTechnicalDetails(undefined);
    try {
      const client = createCreatorPlatformClient();
      // Only the fast createProject call blocks the wizard. The multi-minute PRD generation
      // runs in the background (useCreatorPrd), so the dialog never sits on a long fetch.
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
      const nextBootstrap = await loadCreatorBootstrap(project.id);
      setBootstrap(nextBootstrap);
      setIsCreateProjectDialogOpen(false);
      // Straight into the workspace so building starts immediately; handleSelectProject
      // provisions the sandbox and resets per-project state. The PRD generates in the
      // background and lives in the workspace's PRD tab.
      await handleSelectProject(nextBootstrap.selectedProject, "workspace");
      // PRD is out of the loop for now — the chat log is the project's memory. The PRD tab
      // still offers manual generation whenever the user wants a document.
      setCreateProjectMessage(
        `${project.name} was created. Horizon is preparing the first workspace draft.`
      );
      setCreateProjectTechnicalDetails(undefined);
      // The form's business problem becomes the FIRST build immediately — the user's words
      // must never vanish into a background PRD. Same pattern as handleCreateFromPrompt:
      // explicit overrides because the vibe hook's closure still holds the previous project.
      const firstBuildPrompt = createProjectForm.businessProblem.trim();
      if (firstBuildPrompt) {
        vibeWorkspace.setPromptDraft("");
        void vibeWorkspace.handleVibeChat({
          prompt: firstBuildPrompt,
          projectId: project.id,
          mode: "build"
        });
      }
    } catch (error) {
      setCreateProjectMessage("Project could not be created. Review the details and try again.");
      setCreateProjectTechnicalDetails(error instanceof Error ? error.message : String(error));
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
    createProjectTechnicalDetails,
    isCreatingProject,
    currentPrdVersion,
    prdVersionList,
    selectedProject,
    creatorNavItems,
    visiblePrdSections,
    visibleVersionRows,
    prdMessage,
    prdStatus,
    prdTechnicalDetails,
    prdErrorSource,
    prdFeedbackTone,
    handleConfirmPrdBaseline,
    handleGeneratePrdDraft,
    isGeneratingPrdDraft,
    creatorPage,
    creatorRoute,
    requestedProjectUnavailable,
    pathname,
    pageCopy,
    refreshPrdState,
    handleSignInBridge,
    handleLogoutBridge,
    handleCreateProjectField,
    handleSelectProject,
    handleProjectDeleted,
    handleCreateFromPrompt,
    handleCreateProjectSubmit,
    // Client-side sidebar nav: AppShell calls with a route; navigateBrowserPath pushes history so useBrowserPath re-derives the page.
    onNavigate: navigateBrowserPath,
    creatorSessionControls,
    creatorPageActions,
    ...vibeWorkspace,
    ...publishAccess
  };
}
