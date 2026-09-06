import type { WorkspaceContainerRecord } from "@evcp/types";
import { resourceKeyForProject } from "./resource-ports";

export function resolveWorkspaceWarmPoolSize(
  env: Record<string, string | undefined>,
  mode: "memory" | "real"
): number {
  const raw = env.EVCP_WORKSPACE_WARM_POOL_SIZE;
  if (raw === undefined || raw === "") return mode === "real" ? 3 : 0;
  if (!/^\d+$/.test(raw)) {
    throw new Error("EVCP_WORKSPACE_WARM_POOL_SIZE must be an integer from 0 to 20");
  }
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size > 20) {
    throw new Error("EVCP_WORKSPACE_WARM_POOL_SIZE must be an integer from 0 to 20");
  }
  return size;
}

export function physicalResourceKey(record: WorkspaceContainerRecord): string {
  return record.resourceKey ?? resourceKeyForProject(record.projectId);
}
