import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

test("memory docker engine records exec calls and returns configured result", async () => {
  const engine = createMemoryDockerEngine();
  const { containerId } = await engine.createContainer({
    name: "evcp-ws-demo",
    image: "evcp/workspace-next:1",
    env: [],
    hostConfig: { NanoCpus: 1_000_000_000, Memory: 2048 * 1024 * 1024, NetworkMode: "evcp-internal", Binds: [] },
    labels: {},
    exposedPort: 3000,
    publishPorts: false,
  });
  await engine.startContainer(containerId);

  const result = await engine.execInContainer(containerId, ["echo", "hi"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(engine.state.execCalls, [{ containerId, cmd: ["echo", "hi"] }]);
});

test("docker socket engine execInContainer creates exec, starts it, and inspects the exit code", async () => {
  const calls = [];
  const request = async ({ method, path, body }) => {
    calls.push({ method, path, body });
    if (path === "/containers/c1/exec") {
      return { status: 201, json: async () => ({ Id: "exec-1" }) };
    }
    if (path === "/exec/exec-1/start") {
      return {
        status: 200,
        json: async () => ({}),
        // docker-socket-engine reads raw stdout/stderr off the same response stream in the real client;
        // the fake request() here returns pre-split text so the test stays transport-agnostic.
        text: "hi\n",
      };
    }
    if (path === "/exec/exec-1/json") {
      return { status: 200, json: async () => ({ ExitCode: 0 }) };
    }
    throw new Error(`unexpected path ${path}`);
  };

  const engine = createDockerSocketEngine({ request });
  const result = await engine.execInContainer("c1", ["echo", "hi"]);

  assert.equal(result.exitCode, 0);
  assert.equal(calls[0].path, "/containers/c1/exec");
  assert.deepEqual(calls[0].body.Cmd, ["echo", "hi"]);
  assert.equal(calls[1].path, "/exec/exec-1/start");
  assert.equal(calls[2].path, "/exec/exec-1/json");
});
