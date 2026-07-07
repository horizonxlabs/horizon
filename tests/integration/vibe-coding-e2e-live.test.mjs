// End-to-end "vibe coding" smoke: a prompt streams to a real LLM (via LiteLLM),
// the AI writes a file into the project's real dev container, and the turn commits.
// USER-gated: requires a real ANTHROPIC_API_KEY + LITELLM_MASTER_KEY in docker/.env,
// LiteLLM running, and platform-api recreated. Skipped unless EVCP_VIBE_LIVE=1.
import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const LIVE = process.env.EVCP_VIBE_LIVE === "1";

async function drain(iterable) {
  const events = [];
  for await (const e of iterable) events.push(e);
  return events;
}

test(
  "prompt -> AI writes a real file into the container and commits",
  { skip: !LIVE },
  async () => {
    const env = { ...process.env, EVCP_WORKSPACE_REAL_ADAPTERS: "1" };
    const orchestrator = createDefaultWorkspaceOrchestrator({ env });
    const gen = createDefaultGenerationService({ orchestrator, env });

    const slug = "vibe" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
    const projectId = `proj-${slug}`;
    const record = await orchestrator.provisionWorkspace({ projectId, slug });

    try {
      const events = await drain(
        gen.runTurn({
          projectId,
          prompt:
            "Create a file app/hello.txt containing exactly the text HELLO_FROM_AI. " +
            'Emit it as an <action type="file" filePath="app/hello.txt">HELLO_FROM_AI</action> inside an <artifact>.'
        })
      );

      // a commit event with a real git sha (not the no-container sentinel)
      const commit = events.find((e) => e.type === "commit");
      assert.ok(commit && /^[0-9a-f]{7,40}$/.test(commit.sha), "expected a real git commit sha");

      // the AI-written file exists in the real container (verify via the Docker socket,
      // not the docker CLI — the platform-api container has the socket, not the binary)
      const engine = createDockerSocketEngine();
      const { stdout } = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        "cat /workspace/app/hello.txt 2>/dev/null || true"
      ]);
      assert.match(stdout, /HELLO_FROM_AI/, "expected the AI-written file in the container");
    } finally {
      await orchestrator.deleteWorkspace(projectId);
    }
  }
);
