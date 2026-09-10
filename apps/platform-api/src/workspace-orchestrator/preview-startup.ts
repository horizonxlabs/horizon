import type { WorkspaceContainerRecord } from "@evcp/types";
import type { DockerEngine } from "./docker-engine";
import { inspectWorkspaceContainer } from "./runtime-location";

export type PreviewStartupPhase =
  "preparing" | "dependencies" | "starting" | "compiling" | "ready" | "failed" | "error";
const phases = new Set<PreviewStartupPhase>([
  "dependencies",
  "starting",
  "compiling",
  "ready",
  "failed",
  "error"
]);
export async function readPreviewStartup(
  docker: DockerEngine,
  record: WorkspaceContainerRecord | undefined
): Promise<{ phase: PreviewStartupPhase }> {
  if (!record) return { phase: "preparing" };
  try {
    const container = await inspectWorkspaceContainer(docker, record);
    if (!container?.running || container.containerId !== record.containerId)
      return { phase: "preparing" };
    const result = await docker.execInContainer(container.containerId, [
      "sh",
      "-c",
      "cat /tmp/evcp-preview-startup.json 2>/dev/null"
    ]);
    const phase = JSON.parse(result.stdout).phase;
    if (phases.has(phase)) return { phase };
  } catch {
    /* Older workspace images don't report detailed startup stages. */
  }
  return { phase: "starting" };
}

// New images precompile the app after their listener opens. Do not spend a second compilation
// on /api/health first. Older images retain their existing HTTP readiness check.
export const PREVIEW_READY_COMMAND = `attempt=0; while [ "$attempt" -lt 600 ]; do
if [ -f /usr/local/lib/evcp/workspace-dev.cjs ]; then
  grep -Eq '"phase":"(compiling|ready|error)"' /tmp/evcp-preview-startup.json 2>/dev/null && exit 0
else
  curl --connect-timeout 1 --max-time 2 -fsS "http://127.0.0.1:3000\${EVCP_PREVIEW_BASE:-}/api/health" >/dev/null 2>&1 && exit 0
fi
attempt=$((attempt + 1)); sleep 0.2; done; exit 1`;
