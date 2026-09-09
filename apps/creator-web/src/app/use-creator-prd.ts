import type { PrdVersionDto } from "@evcp/api-client";
import { useEffect, useRef, useState } from "react";
import {
  PRD_GENERATION_POLL_INTERVAL_MS,
  isPrdGenerationTimedOut,
  loadPrdState,
  runBackgroundPrdGeneration
} from "@/app/creator-app-helpers";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { CreatorProjectView } from "@/shared/types";
import type { CreatorProjectRuntimeRequest } from "@/app/creator-project-runtime";

type PendingPrdGeneration = { projectId: string; startedAt: number };
export type CreatorPrdStatus = "loading" | "ready" | "empty" | "error";
export type CreatorPrdErrorSource = "load" | "generation";
export type CreatorPrdFeedbackTone = "success" | "warning" | "danger";

export function useCreatorPrd(
  selectedProject: CreatorProjectView,
  dependencies: { loadPrdState?: typeof loadPrdState } = {}
) {
  const [currentPrdVersion, setCurrentPrdVersion] = useState<PrdVersionDto>();
  const [prdVersionList, setPrdVersionList] = useState<PrdVersionDto[]>([]);
  const [prdStatus, setPrdStatus] = useState<CreatorPrdStatus>("loading");
  const [prdMessage, setPrdMessage] = useState("Loading docs.");
  const [prdTechnicalDetails, setPrdTechnicalDetails] = useState<string>();
  const [prdErrorSource, setPrdErrorSource] = useState<CreatorPrdErrorSource>();
  const [prdFeedbackTone, setPrdFeedbackTone] = useState<CreatorPrdFeedbackTone>();
  const [isGeneratingPrdDraft, setIsGeneratingPrdDraft] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingPrdGeneration>();
  // Two completion paths race (the direct response and the poll); refs let whichever lands
  // first settle the pending generation exactly once.
  const pendingRef = useRef<PendingPrdGeneration | undefined>(undefined);
  pendingRef.current = pendingGeneration;
  const selectedProjectIdRef = useRef(selectedProject.id);
  selectedProjectIdRef.current = selectedProject.id;
  const refreshGenerationRef = useRef(0);
  const manualActionRef = useRef({ projectId: selectedProject.id, generation: 0 });
  if (manualActionRef.current.projectId !== selectedProject.id) {
    manualActionRef.current = {
      projectId: selectedProject.id,
      generation: manualActionRef.current.generation + 1
    };
  }

  function beginManualAction(projectId: string) {
    const generation = manualActionRef.current.generation + 1;
    manualActionRef.current = { projectId, generation };
    return () =>
      manualActionRef.current.projectId === projectId &&
      manualActionRef.current.generation === generation &&
      selectedProjectIdRef.current === projectId;
  }

  const visiblePrdSections =
    currentPrdVersion?.sections?.map((section) => ({
      key: section.key,
      title: section.title,
      body: section.body,
      order: String(section.order)
    })) ?? [];
  const visibleVersionRows = prdVersionList.map((version) => ({
    version: version.version,
    status: version.status,
    summary: version.changeSummary,
    author: selectedProject.owner
  }));

  async function refreshPrdState(projectId: string, runtimeRequest?: CreatorProjectRuntimeRequest) {
    const refreshGeneration = ++refreshGenerationRef.current;
    const isCurrent = () =>
      refreshGeneration === refreshGenerationRef.current &&
      (runtimeRequest
        ? runtimeRequest.projectId === projectId && runtimeRequest.isCurrent()
        : selectedProjectIdRef.current === projectId);
    if (isCurrent()) {
      setPrdStatus("loading");
      setPrdMessage("Loading docs.");
      setPrdTechnicalDetails(undefined);
      setPrdErrorSource(undefined);
      setPrdFeedbackTone(undefined);
    }
    try {
      const prdState = await (dependencies.loadPrdState ?? loadPrdState)(
        projectId,
        runtimeRequest?.signal
      );
      if (!isCurrent()) return;
      setCurrentPrdVersion(prdState.current);
      setPrdVersionList(prdState.versions);
      setPrdStatus(prdState.current ? "ready" : "empty");
      setPrdMessage(prdState.current ? "Your document is ready." : "No docs yet.");
    } catch (error) {
      if (!isCurrent()) return;
      setCurrentPrdVersion(undefined);
      setPrdVersionList([]);
      setPrdStatus("error");
      setPrdErrorSource("load");
      setPrdMessage("Docs could not be loaded.");
      setPrdTechnicalDetails(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async function handleConfirmPrdBaseline() {
    if (!selectedProject.id || !currentPrdVersion) {
      setPrdMessage("No document draft is available to confirm.");
      setPrdFeedbackTone("warning");
      return;
    }
    const projectId = selectedProject.id;
    const isCurrent = beginManualAction(projectId);
    try {
      const baseline = await createCreatorPlatformClient().confirmPrdBaseline(projectId, {
        versionId: currentPrdVersion.id
      });
      if (!isCurrent()) return;
      setCurrentPrdVersion(baseline);
      setPrdVersionList((current) => [
        baseline,
        ...current.filter((version) => version.id !== baseline.id)
      ]);
      setPrdStatus("ready");
      setPrdMessage(`Baseline v${baseline.version} confirmed.`);
      setPrdFeedbackTone("success");
      setPrdTechnicalDetails(undefined);
    } catch (error) {
      if (!isCurrent()) return;
      setPrdMessage("Baseline could not be confirmed. The current document is unchanged.");
      setPrdFeedbackTone("danger");
      setPrdTechnicalDetails(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleGeneratePrdDraft() {
    if (!selectedProject.id) {
      setPrdMessage("Select a project before generating docs.");
      setPrdFeedbackTone("warning");
      return;
    }
    const projectId = selectedProject.id;
    const isCurrent = beginManualAction(projectId);
    setIsGeneratingPrdDraft(true);
    setPrdMessage("Generating docs.");
    setPrdFeedbackTone(undefined);
    setPrdTechnicalDetails(undefined);
    setPrdErrorSource(undefined);
    try {
      const draft = await createCreatorPlatformClient().generatePrdDraft(projectId);
      if (!isCurrent()) return;
      setCurrentPrdVersion(draft);
      setPrdVersionList((current) => [
        draft,
        ...current.filter((version) => version.id !== draft.id)
      ]);
      setPrdStatus("ready");
      setPrdMessage(`Document v${draft.version} saved.`);
      setPrdFeedbackTone("success");
    } catch (error) {
      if (!isCurrent()) return;
      setPrdStatus("error");
      setPrdErrorSource("generation");
      setPrdMessage("The document could not be generated.");
      setPrdTechnicalDetails(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrent()) setIsGeneratingPrdDraft(false);
    }
  }

  function resetPrdState() {
    refreshGenerationRef.current += 1;
    manualActionRef.current = {
      projectId: selectedProjectIdRef.current,
      generation: manualActionRef.current.generation + 1
    };
    pendingRef.current = undefined;
    setPendingGeneration(undefined);
    setIsGeneratingPrdDraft(false);
    setCurrentPrdVersion(undefined);
    setPrdVersionList([]);
    setPrdStatus("loading");
    setPrdMessage("Loading docs.");
    setPrdTechnicalDetails(undefined);
    setPrdErrorSource(undefined);
    setPrdFeedbackTone(undefined);
  }

  function settlePendingGeneration(projectId: string, draft?: PrdVersionDto) {
    if (pendingRef.current?.projectId !== projectId) return;
    setPendingGeneration(undefined);
    setIsGeneratingPrdDraft(false);
    if (!draft || selectedProjectIdRef.current !== projectId) return;
    setCurrentPrdVersion(draft);
    setPrdVersionList((current) => [
      draft,
      ...current.filter((version) => version.id !== draft.id)
    ]);
    setPrdStatus("ready");
    setPrdMessage(`Document v${draft.version} saved.`);
    setPrdFeedbackTone("success");
    setPrdTechnicalDetails(undefined);
  }

  // The wizard closes right after createProject; the multi-minute PRD call runs here instead,
  // with the poll below as the recovery path when this request dies mid-flight.
  function beginBackgroundPrdGeneration(projectId: string) {
    setIsGeneratingPrdDraft(true);
    setPendingGeneration({ projectId, startedAt: Date.now() });
    setPrdMessage("Generating an optional document. This can take a few minutes.");
    setPrdFeedbackTone(undefined);
    setPrdTechnicalDetails(undefined);
    setPrdErrorSource(undefined);
    void runBackgroundPrdGeneration(createCreatorPlatformClient(), projectId, {
      onDraft: (draft) => settlePendingGeneration(projectId, draft),
      onError: () => {
        // The server keeps generating even when this request dies — let the poll finish the job.
        if (pendingRef.current?.projectId === projectId) {
          setPrdMessage("Generation is continuing. Waiting for the draft to appear.");
        }
      }
    });
  }

  useEffect(() => {
    if (!pendingGeneration) return;
    const timer = window.setInterval(() => {
      if (isPrdGenerationTimedOut(pendingGeneration.startedAt, Date.now())) {
        setPendingGeneration(undefined);
        setIsGeneratingPrdDraft(false);
        setPrdStatus("error");
        setPrdErrorSource("generation");
        setPrdMessage("Document generation is taking longer than expected.");
        return;
      }
      void loadPrdState(pendingGeneration.projectId)
        .then((state) => {
          if (state.current) settlePendingGeneration(pendingGeneration.projectId, state.current);
        })
        .catch(() => undefined);
    }, PRD_GENERATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // settlePendingGeneration reads through refs, so pendingGeneration is the only real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGeneration]);

  return {
    currentPrdVersion,
    setCurrentPrdVersion,
    prdVersionList,
    setPrdVersionList,
    prdMessage,
    prdStatus,
    prdTechnicalDetails,
    prdErrorSource,
    prdFeedbackTone,
    setPrdMessage,
    isGeneratingPrdDraft,
    visiblePrdSections,
    visibleVersionRows,
    refreshPrdState,
    handleConfirmPrdBaseline,
    handleGeneratePrdDraft,
    beginBackgroundPrdGeneration,
    resetPrdState
  };
}
