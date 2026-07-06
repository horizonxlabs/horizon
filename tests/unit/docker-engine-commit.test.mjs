import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const spec = {
  name: "evcp-ws-demo", image: "img", env: [],
  hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
  labels: {}, exposedPort: 3000, publishPorts: false
};

test("memory docker engine records commit calls and returns an image id", async () => {
  const engine = createMemoryDockerEngine();
  const { containerId } = await engine.createContainer(spec);
  const result = await engine.commitContainer(containerId, "evcp-prod-demo:abc123");
  assert.match(result.imageId, /^mem-image-/);
  assert.deepEqual(engine.state.commits, [{ containerId, imageTag: "evcp-prod-demo:abc123" }]);
});

test("docker socket engine commitContainer posts /commit with repo+tag and returns Id", async () => {
  const calls = [];
  const request = async ({ method, path }) => {
    calls.push({ method, path });
    if (path.startsWith("/commit")) {
      return { status: 201, json: async () => ({ Id: "sha256:deadbeef" }) };
    }
    throw new Error(`unexpected path ${path}`);
  };
  const engine = createDockerSocketEngine({ request });
  const result = await engine.commitContainer("c1", "evcp-prod-demo:abc123");
  assert.equal(result.imageId, "sha256:deadbeef");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/commit\?container=c1&repo=evcp-prod-demo&tag=abc123$/);
});
