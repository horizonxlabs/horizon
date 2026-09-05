import test from "node:test";
import assert from "node:assert/strict";

const { createWorkspaceOrchestrator } =
  await import("../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts");

export function registerWorkspaceResourceIdentityCases({ createDeps, createRuntimeRecordStore }) {
  test("hydrateRuntimeRecords reconciles a divergent physical key with the logical container", async () => {
    const { deps } = createDeps();
    const runtimeRecords = createRuntimeRecordStore();
    const first = createWorkspaceOrchestrator({ ...deps, runtimeRecords });
    const running = await first.provisionWorkspace({
      projectId: "prj-leave-tracker",
      slug: "leave-tracker"
    });
    runtimeRecords.snapshots.set("prj-leave-tracker", {
      ...runtimeRecords.snapshots.get("prj-leave-tracker"),
      record: { ...running, resourceKey: "warm-slot-abc" }
    });

    const restarted = createWorkspaceOrchestrator({ ...deps, runtimeRecords });
    await restarted.hydrateRuntimeRecords(runtimeRecords);

    assert.equal(restarted.getWorkspace("prj-leave-tracker").state, "running");
    assert.equal(restarted.getWorkspace("prj-leave-tracker").containerId, running.containerId);
  });

  test("wakeWorkspace recreates logical container and preview path for divergent physical key", async () => {
    const { deps } = createDeps();
    const runtimeRecords = createRuntimeRecordStore();
    const first = createWorkspaceOrchestrator({ ...deps, runtimeRecords });
    const running = await first.provisionWorkspace({
      projectId: "prj-leave-tracker",
      slug: "leave-tracker"
    });
    await first.stopWorkspace("prj-leave-tracker");
    await deps.docker.removeContainer(running.containerId);
    runtimeRecords.snapshots.set("prj-leave-tracker", {
      ...runtimeRecords.snapshots.get("prj-leave-tracker"),
      record: {
        ...runtimeRecords.snapshots.get("prj-leave-tracker").record,
        resourceKey: "warm-slot-abc"
      }
    });

    const restarted = createWorkspaceOrchestrator({ ...deps, runtimeRecords });
    await restarted.hydrateRuntimeRecords(runtimeRecords);
    await restarted.wakeWorkspace("prj-leave-tracker");

    const recreated = deps.docker.state.containers[0];
    assert.equal(recreated.spec.name, "evcp-ws-prj-leave-tracker");
    assert.ok(recreated.spec.env.includes("EVCP_PREVIEW_BASE=/preview/prj-leave-tracker"));
    assert.equal(recreated.spec.hostConfig.Mounts[0].Source, "evcp-ws-warm-slot-abc-data");
  });
}
