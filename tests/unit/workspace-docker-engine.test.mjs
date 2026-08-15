import test from "node:test";
import assert from "node:assert/strict";

const { buildDevContainerSpec, createMemoryDockerEngine } =
  await import("../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts");

const baseInput = {
  projectId: "prj_leave_tracker",
  slug: "leave-tracker",
  image: "evcp/workspace-next:1",
  env: { DATABASE_URL: "postgresql://x", S3_BUCKET: "proj-leave-tracker" },
  cpuCores: 1,
  memoryMb: 2048,
  network: "evcp-internal",
  workspaceVolume: "evcp-ws-leave-tracker-data"
};

test("builds a locked-down dev container spec", () => {
  const spec = buildDevContainerSpec(baseInput);
  assert.equal(spec.name, "evcp-ws-leave-tracker");
  assert.equal(spec.publishPorts, false);
  assert.equal(spec.exposedPort, 3000);
  assert.equal(spec.hostConfig.NetworkMode, "evcp-internal");
  assert.equal(spec.hostConfig.NanoCpus, 1_000_000_000);
  assert.equal(spec.hostConfig.Memory, 2048 * 1024 * 1024);
  assert.deepEqual(spec.hostConfig.Binds, []);
  assert.deepEqual(spec.hostConfig.Mounts, [
    {
      Type: "volume",
      Source: "evcp-ws-leave-tracker-data",
      Target: "/workspace",
      VolumeOptions: { NoCopy: true }
    }
  ]);
  assert.ok(spec.env.includes("DATABASE_URL=postgresql://x"));
  assert.equal(spec.labels["evcp.project-slug"], "leave-tracker");
  assert.equal(spec.labels["evcp.project-id"], "prj_leave_tracker");
});

test("memory docker engine tracks lifecycle", async () => {
  const engine = createMemoryDockerEngine();
  await engine.ensureVolume("evcp-ws-leave-tracker-data", {
    "evcp.managed": "true",
    "evcp.project-id": "prj_leave_tracker"
  });
  assert.deepEqual(
    (await engine.listManagedVolumes()).map((volume) => volume.name),
    ["evcp-ws-leave-tracker-data"]
  );
  const spec = buildDevContainerSpec(baseInput);
  const { containerId } = await engine.createContainer(spec);
  await engine.startContainer(containerId);
  assert.equal(engine.state.containers[0].status, "running");
  assert.equal((await engine.listManagedContainers())[0].name, "evcp-ws-leave-tracker");
  await engine.stopContainer(containerId);
  assert.equal(engine.state.containers[0].status, "stopped");
  await engine.removeContainer(containerId);
  assert.equal(engine.state.containers.length, 0);
  await engine.removeVolume("evcp-ws-leave-tracker-data");
  assert.equal(engine.state.volumes.length, 0);
});

test("stopping an unknown container throws", async () => {
  const engine = createMemoryDockerEngine();
  await assert.rejects(() => engine.stopContainer("missing"), /unknown container/);
});

test("preview readiness uses sub-second polling without shortening the timeout budget", async () => {
  const { waitForPreviewReady } =
    await import("../../apps/platform-api/src/workspace-orchestrator/workspace-lifecycle.ts");
  let command = "";
  await waitForPreviewReady(
    {
      execInContainer: async (_containerId, cmd) => {
        command = cmd.join(" ");
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    },
    "container-1"
  );

  assert.match(command, /attempt.*-lt 600/);
  assert.match(command, /sleep 0\.2/);
});
