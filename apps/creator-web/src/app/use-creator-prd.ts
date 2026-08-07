import type { PrdVersionDto } from "@evcp/api-client";
import { useState } from "react";
import { loadPrdState } from "@/app/creator-app-helpers";
import { createCreatorPlatformClient } from "@/shared/creator-client";
import type { CreatorProjectView } from "@/shared/types";

export function useCreatorPrd(selectedProject: CreatorProjectView) {
  const [currentPrdVersion, setCurrentPrdVersion] = useState<PrdVersionDto>();
  const [prdVersionList, setPrdVersionList] = useState<PrdVersionDto[]>([]);
  const [prdMessage, setPrdMessage] = useState("Loading PRD state from Platform API.");
  const [isGeneratingPrdDraft, setIsGeneratingPrdDraft] = useState(false);

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
    resetPrdState
  };
}
