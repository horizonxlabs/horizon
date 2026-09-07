import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";
import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";

const projectId = "prj_probe";
const runtime = {
  projectId,
  resourceKey: "warm-probe",
  containerId: "physical-container",
  state: "running"
};

async function fixture({ record = runtime, containers = {} } = {}) {
  const probes = [];
  const service = await createDefaultGenerationService({
    env: {},
    orchestrator: { getWorkspace: (id) => (id === projectId ? record : null), markActivity() {} },
    docker: {
      async inspectContainer(name) {
        return containers[name] ?? null;
      },
      async execInContainer(containerId, command) {
        const url = command.at(-1).match(/http:\/\/127\.0\.0\.1:3000\/preview\/[\w-]+/)?.[0];
        probes.push({ containerId, url });
        const container = Object.values(containers).find(
          (entry) => entry.containerId === containerId
        );
        const base = container?.env
          .find((entry) => entry.startsWith("EVCP_PREVIEW_BASE="))
          ?.slice("EVCP_PREVIEW_BASE=".length);
        return {
          stdout: `STATUS:${url === `http://127.0.0.1:3000${base}` ? 200 : 404}\n`,
          stderr: "",
          exitCode: 0
        };
      }
    }
  });
  return { service, probes };
}

function container(previewKey, overrides = {}) {
  return {
    containerId: runtime.containerId,
    running: true,
    image: "workspace:test",
    labels: {},
    env: [`EVCP_PREVIEW_BASE=/preview/${previewKey}`],
    ...overrides
  };
}

for (const [name, containers, previewKey] of [
  ["hot physical runtime", { "evcp-ws-warm-probe": container("warm-probe") }, "warm-probe"],
  ["guarded legacy runtime", { "evcp-ws-prj-probe": container("prj-probe") }, "prj-probe"]
]) {
  test(`committed ${name} probes its authoritative base without publishing a false runtime bug`, async () => {
    const { service, probes } = await fixture({ containers });
    const handler = createChatSseHandler({
      generationService: {
        ...service,
        async *runTurn(input) {
          assert.equal(input.projectId, projectId);
          yield { type: "commit", sha: "a".repeat(40) };
          yield { type: "done" };
        }
      },
      resolveAuth: async () => ({
        userId: "owner",
        roles: ["creator"],
        projectIds: [projectId],
        actor: { id: "owner" }
      })
    });
    const chunks = [];
    await handler(
      {
        url: `/projects/${projectId}/chat`,
        method: "POST",
        body: { prompt: "Commit the edit", agentMode: "build" },
        once() {},
        off() {}
      },
      {
        once() {},
        off() {},
        writeHead() {},
        flushHeaders() {},
        end() {},
        write(chunk) {
          chunks.push(chunk);
        }
      }
    );
    assert.deepEqual(probes, [
      { containerId: "physical-container", url: `http://127.0.0.1:3000/preview/${previewKey}` }
    ]);
    const events = chunks
      .flatMap((chunk) => chunk.split("\n"))
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    assert.equal(
      events.some((event) => event.type === "commit"),
      true
    );
    assert.deepEqual(events.find((event) => event.type === "bug_report")?.bugs, []);
  });
}

for (const [name, record, containers] of [
  ["missing runtime", null, {}],
  [
    "idle runtime",
    { ...runtime, state: "idle" },
    { "evcp-ws-warm-probe": container("warm-probe") }
  ],
  [
    "stopped physical container",
    runtime,
    { "evcp-ws-warm-probe": container("warm-probe", { running: false }) }
  ],
  ["missing physical container", runtime, {}],
  [
    "replacement physical container",
    runtime,
    { "evcp-ws-warm-probe": container("warm-probe", { containerId: "replacement-container" }) }
  ],
  [
    "unrelated legacy container",
    runtime,
    { "evcp-ws-prj-probe": container("prj-probe", { containerId: "other-owner" }) }
  ],
  ["mismatched preview base", runtime, { "evcp-ws-warm-probe": container("wrong-base") }]
]) {
  test(`post-turn probe skips ${name} without exposing infrastructure details`, async () => {
    const { service, probes } = await fixture({ record, containers });
    assert.deepEqual(await service.probeRuntime(projectId), { status: 0, errors: [] });
    assert.deepEqual(probes, []);
  });
}

test("post-turn inspection errors are unavailable diagnostics with no secret-bearing exception", async () => {
  const { service, probes } = await fixture({
    containers: {
      get "evcp-ws-warm-probe"() {
        throw new Error("inspection failed with confidential adapter details");
      }
    }
  });
  assert.deepEqual(await service.probeRuntime(projectId), { status: 0, errors: [] });
  assert.deepEqual(probes, []);
});
