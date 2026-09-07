import assert from "node:assert/strict";
import test from "node:test";
import * as runtimeLocation from "../../apps/platform-api/src/workspace-orchestrator/runtime-location.ts";

const { workspaceContainerName, workspacePhysicalKey, workspacePreviewBase } = runtimeLocation;
const { buildDevContainerSpec, createMemoryDockerEngine } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

test("runtime location uses the persisted physical key for a warm claim", () => {
  const record = { projectId: "prj_alpha", resourceKey: "warm-resource-1" };
  assert.equal(workspacePhysicalKey(record), "warm-resource-1");
  assert.equal(workspaceContainerName(record), "evcp-ws-warm-resource-1");
  assert.equal(workspacePreviewBase(record), "/preview/warm-resource-1");
});

test("runtime location falls back to the logical key for legacy rows", () => {
  const record = { projectId: "prj_alpha" };
  assert.equal(workspacePhysicalKey(record), "prj-alpha");
  assert.equal(workspaceContainerName(record), "evcp-ws-prj-alpha");
});

test("preview location preserves an exact-id legacy container and its logical preview base", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer(
    buildDevContainerSpec({
      projectId: "prj_alpha",
      slug: "prj-alpha",
      image: "evcp/workspace-next:1",
      env: { EVCP_PREVIEW_BASE: "/preview/prj-alpha" },
      cpuCores: 1,
      memoryMb: 2048,
      network: "evcp-internal",
      workspaceVolume: "evcp-ws-warm-resource-1-data"
    })
  );
  await docker.startContainer(containerId);

  const location = await runtimeLocation.resolveWorkspacePreviewLocation(docker, {
    projectId: "prj_alpha",
    resourceKey: "warm-resource-1",
    containerId
  });

  assert.deepEqual(location, {
    containerName: "evcp-ws-prj-alpha",
    previewKey: "prj-alpha",
    previewBase: "/preview/prj-alpha"
  });
});

test("preview location rejects a legacy name whose container id is not the persisted runtime", async () => {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer(
    buildDevContainerSpec({
      projectId: "prj_alpha",
      slug: "prj-alpha",
      image: "evcp/workspace-next:1",
      env: { EVCP_PREVIEW_BASE: "/preview/prj-alpha" },
      cpuCores: 1,
      memoryMb: 2048,
      network: "evcp-internal",
      workspaceVolume: "evcp-ws-warm-resource-1-data"
    })
  );
  await docker.startContainer(containerId);

  const location = await runtimeLocation.resolveWorkspacePreviewLocation(docker, {
    projectId: "prj_alpha",
    resourceKey: "warm-resource-1",
    containerId: "unrelated-container"
  });

  assert.equal(location, null);
});
