import test from "node:test";
import assert from "node:assert/strict";

const { createDockerSocketEngine, buildCreateContainerBody } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts"
);
const { buildDevContainerSpec } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

const spec = buildDevContainerSpec({
  slug: "leave-tracker",
  image: "evcp/workspace-next:1",
  env: { DATABASE_URL: "postgresql://x", S3_BUCKET: "proj-leave-tracker" },
  cpuCores: 1,
  memoryMb: 2048,
  network: "evcp-internal",
  workspaceVolume: "evcp-ws-leave-tracker-data"
});

test("buildCreateContainerBody maps the spec to Docker API shape without port publishing", () => {
  const body = buildCreateContainerBody(spec);
  assert.equal(body.Image, "evcp/workspace-next:1");
  assert.ok(Array.isArray(body.Env) && body.Env.includes("DATABASE_URL=postgresql://x"));
  assert.equal(body.HostConfig.NanoCpus, 1_000_000_000);
  assert.equal(body.HostConfig.Memory, 2048 * 1024 * 1024);
  assert.equal(body.HostConfig.NetworkMode, "evcp-internal");
  assert.deepEqual(body.HostConfig.Binds, ["evcp-ws-leave-tracker-data:/workspace"]);
  assert.equal(body.Labels["evcp.project-slug"], "leave-tracker");
  assert.ok(!("PortBindings" in body.HostConfig), "must never publish host ports");
});

test("createContainer POSTs to /containers/create with ?name and returns id", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path, body }) => {
      calls.push({ method, path, body });
      if (path.startsWith("/containers/create")) {
        return { status: 201, json: async () => ({ Id: "abc123" }) };
      }
      return { status: 204, json: async () => ({}) };
    }
  });
  const { containerId } = await engine.createContainer(spec);
  assert.equal(containerId, "abc123");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/containers\/create\?name=evcp-ws-leave-tracker$/);
  assert.equal(calls[0].body.Image, "evcp/workspace-next:1");
});

test("start/stop/remove hit the right endpoints", async () => {
  const calls = [];
  const engine = createDockerSocketEngine({
    request: async ({ method, path }) => {
      calls.push(`${method} ${path}`);
      return { status: 204, json: async () => ({}) };
    }
  });
  await engine.startContainer("abc123");
  await engine.stopContainer("abc123");
  await engine.removeContainer("abc123");
  assert.deepEqual(calls, [
    "POST /containers/abc123/start",
    "POST /containers/abc123/stop",
    "DELETE /containers/abc123?force=true"
  ]);
});

test("non-2xx throws a descriptive error", async () => {
  const engine = createDockerSocketEngine({
    request: async () => ({ status: 500, json: async () => ({ message: "boom" }) })
  });
  await assert.rejects(() => engine.startContainer("abc123"), /docker engine start failed \(500\)/);
});
