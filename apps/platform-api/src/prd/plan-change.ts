import type { PrdChangeRequest } from "../platform-services";

// Synthesizes a "prompt"-sourced PRD change request from an approved plan, so PrdService can turn it
// into a durable draft PRD version. Kept pure (no service access) for direct unit testing.
export function buildPlanChangeRequest(
  projectId: string,
  title: string,
  planText: string,
  requestedByUserId: string,
  affectedSections: string[]
): PrdChangeRequest {
  const now = new Date().toISOString();
  return {
    id: `prdchg_${projectId}_plan_${Date.now().toString(36)}`,
    projectId,
    sourceType: "prompt",
    title: title.trim(),
    proposedRequirement: planText,
    affectedSections,
    acceptanceCriteria: [],
    riskLevel: "low",
    status: "draft",
    requestedByUserId,
    createdAt: now,
    updatedAt: now,
    decisions: []
  };
}
