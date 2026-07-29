import type { PlatformUser, PrdVersion, PrdService } from "../platform-services";
import { buildPlanChangeRequest } from "./plan-change";

// Records a durable draft PRD version from an approved plan by reusing PrdService's change→version
// path. The plan text is appended to the "core_flows" section (or the first section) so it actually
// lands in the new version; the caller (chat route) invokes this fail-soft.
export function createPlanVersionRecorder(prds: Pick<PrdService, "getCurrent" | "createVersionFromChange">) {
  return async (actor: PlatformUser, projectId: string, planText: string): Promise<PrdVersion> => {
    const current = prds.getCurrent(actor, projectId);
    const targetKey =
      current.sections.find((section) => section.key === "core_flows")?.key ??
      current.sections[0]?.key ??
      "core_flows";
    const title = planText.trim().split("\n")[0]?.slice(0, 80).trim() || "Approved plan";
    const change = buildPlanChangeRequest(projectId, title, planText, actor.id, [targetKey]);
    return prds.createVersionFromChange(actor, projectId, change);
  };
}
