import type { PiGenerationServiceDeps } from "./generation-service-types";
import { safeToolError } from "./pi-tool-policy";

export async function releasePiTurnSnapshot(
  deps: Pick<PiGenerationServiceDeps, "workspaceGuard" | "onAudit">,
  projectId: string,
  snapshotToken: string | undefined
): Promise<void> {
  if (!snapshotToken) return;
  try {
    await deps.workspaceGuard.releaseSnapshot(projectId, snapshotToken);
    deps.onAudit?.({
      action: "workspace_snapshot_release",
      projectId,
      metadata: { ok: true }
    });
  } catch (error) {
    deps.onAudit?.({
      action: "workspace_snapshot_release",
      projectId,
      metadata: { ok: false, error: safeToolError(error) }
    });
  }
}
