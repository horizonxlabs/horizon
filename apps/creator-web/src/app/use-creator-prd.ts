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

type PendingPrdGeneration = { projectId: string; startedAt: number };

export function useCreatorPrd(selectedProject: CreatorProjectView) {
  const [currentPrdVersion, setCurrentPrdVersion] = useState<PrdVersionDto>();
  const [prdVersionList, setPrdVersionList] = useState<PrdVersionDto[]>([]);
  const [prdMessage, setPrdMessage] = useState("Loading PRD state from Platform API.");
  const [isGeneratingPrdDraft, setIsGeneratingPrdDraft] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<PendingPrdGeneration>();
  // Two completion paths race (the direct response and the poll); refs let whichever lands
  // first settle the pending generation exactly once.
  const pendingRef = useRef<PendingPrdGeneration | undefined>(undefined);
  pendingRef.current = pendingGeneration;
  const selectedProjectIdRef = useRef(selectedProject.id);
  selectedProjectIdRef.current = selectedProject.id;

  const visiblePrdSections = currentPrdVersion?.sections?.map((section) => ({
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

  async function handleGeneratePrdDraft() {
    if (!selectedProject.id) {
      setPrdMessage("Select a project before generating a PRD draft.");
      return;
    }
    setIsGeneratingPrdDraft(true);
    setPrdMessage("Generating PRD draft through the governed AI route.");
    try {
      const draft = await createCreatorPlatformClient().generatePrdDraft(selectedProject.id);
      setCurrentPrdVersion(draft);
      setPrdVersionList((current) => [
        draft,
        ...current.filter((version) => version.id !== draft.id)
      ]);
      setPrdMessage(`PRD draft v${draft.version} generated through Platform API.`);
    } catch (error) {
      setPrdMessage(
        `PRD generation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsGeneratingPrdDraft(false);
    }
  }

  function resetPrdState() {
    setCurrentPrdVersion(undefined);
    setPrdVersionList([]);
  }

  function settlePendingGeneration(projectId: string, draft?: PrdVersionDto) {
    if (pendingRef.current?.projectId !== projectId) return;
    setPendingGeneration(undefined);
    setIsGeneratingPrdDraft(false);
    if (!draft || selectedProjectIdRef.current !== projectId) return;
    setCurrentPrdVersion(draft);
    setPrdVersionList((current) => [draft, ...current.filter((version) => version.id !== draft.id)]);
    setPrdMessage(`PRD draft v${draft.version} generated through Platform API.`);
  }

  // The wizard closes right after createProject; the multi-minute PRD call runs here instead,
  // with the poll below as the recovery path when this request dies mid-flight.
  function beginBackgroundPrdGeneration(projectId: string) {
    setIsGeneratingPrdDraft(true);
    setPendingGeneration({ projectId, startedAt: Date.now() });
    setPrdMessage("Generating the first PRD draft in the background — this can take a few minutes.");
    void runBackgroundPrdGeneration(createCreatorPlatformClient(), projectId, {
      onDraft: (draft) => settlePendingGeneration(projectId, draft),
      onError: () => {
        // The server keeps generating even when this request dies — let the poll finish the job.
        if (pendingRef.current?.projectId === projectId) {
          setPrdMessage("Generation call was interrupted; watching for the draft to appear.");
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
        setPrdMessage("PRD generation is taking longer than expected. Retry generating the draft.");
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
