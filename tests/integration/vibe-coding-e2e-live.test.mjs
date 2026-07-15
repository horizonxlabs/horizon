// End-to-end "vibe coding" smoke: a prompt streams to a real LLM (via LiteLLM),
// the AI writes a file into the project's real dev container, and the turn commits.
// USER-gated: requires a real ANTHROPIC_API_KEY + LITELLM_MASTER_KEY in docker/.env,
// LiteLLM running, and platform-api recreated. Skipped unless EVCP_VIBE_LIVE=1.
import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";
import { createPrismaAiGovernancePersistence } from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";
import { PrismaAiExecutionStore } from "../../apps/platform-api/src/persistence/ai-execution-repository.ts";
import { createPrismaWorkspaceRuntimeRecordStore } from "../../apps/platform-api/src/persistence/workspace-runtime-repository.ts";
import { createPersistedGovernedAiExecutor } from "../../apps/platform-api/src/ai-governance/execution-runtime.ts";
import { VaultKvV2AiSecretStore } from "../../apps/platform-api/src/ai-governance/secret-store.ts";

const LIVE = process.env.EVCP_VIBE_LIVE === "1";

async function drain(iterable) {
  const events = [];
  for await (const e of iterable) events.push(e);
  return events;
}

test(
  "live AI commit survives validation failure and workspace restart",
  { skip: !LIVE },
  async () => {
    const env = { ...process.env, EVCP_WORKSPACE_REAL_ADAPTERS: "1" };
    let orchestrator = createDefaultWorkspaceOrchestrator({ env });
    const secretStore = new VaultKvV2AiSecretStore({
      address: env.VAULT_ADDR,
      mount: env.VAULT_KV_MOUNT ?? "platform",
      tokenFile: env.VAULT_TOKEN_FILE
    });
    const { client } = await createPrismaAiGovernancePersistence(env.DATABASE_URL, secretStore);
    const governedAiExecutor = createPersistedGovernedAiExecutor(client, {
      executionStore: new PrismaAiExecutionStore(client),
      secretStore
    });
    const seed = Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
    const slug = "vibe" + seed;
    const projectId = `proj-${slug}`;
    const actorId = `usr-${slug}`;
    const actor = {
      id: actorId,
      email: `${slug}@example.test`,
      name: "Creator",
      role: "creator",
      status: "active",
      permissions: []
    };
    const engine = createDockerSocketEngine();
    const runtimeStore = await createPrismaWorkspaceRuntimeRecordStore(env.DATABASE_URL);

    try {
      await client.platformUser.create({
        data: {
          id: actorId,
          email: `${slug}@example.test`,
          name: "Live Vibe Creator"
        }
      });
      await client.project.create({
        data: {
          id: projectId,
          name: `Live Vibe ${seed}`,
          status: "active",
          ownerUserId: actorId
        }
      });
      await orchestrator.hydrateRuntimeRecords(runtimeStore);
      let record = await orchestrator.provisionWorkspace({ projectId, slug });
      const gen = await createDefaultGenerationService({ orchestrator, env, governedAiExecutor });

      const events = await drain(
        gen.runTurn({
          projectId,
          prompt:
            "Create a file app/hello.txt containing exactly the text HELLO_FROM_AI. " +
            'Emit it as an <action type="file" filePath="app/hello.txt">HELLO_FROM_AI</action> inside an <artifact>.',
          actor
        })
      );

      // a commit event with a real git sha (not the no-container sentinel)
      const commit = events.find((e) => e.type === "commit");
      const failures = events
        .filter((event) => event.type === "error")
        .map((event) => event.message);
      const actionCount = events.filter((event) => event.type === "action_result").length;
      assert.ok(
        commit && /^[0-9a-f]{7,40}$/.test(commit.sha),
        `expected a real git commit sha (actions=${actionCount}, errors=${failures.join(" | ") || "none"})`
      );

      // the AI-written file exists in the real container (verify via the Docker socket,
      // not the docker CLI — the platform-api container has the socket, not the binary)
      const { stdout } = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        "cat /workspace/app/hello.txt 2>/dev/null || true"
      ]);
      assert.match(stdout, /HELLO_FROM_AI/, "expected the AI-written file in the container");

      const originalPage = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        "cat /workspace/app/page.tsx"
      ]);
      const checkpointsBeforeFailure = await client.workspaceCodeCheckpoint.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" }
      });
      assert.equal(checkpointsBeforeFailure.length, 1);

      const failingGen = await createDefaultGenerationService({
        orchestrator,
        env,
        governedAiExecutor: {
          execute: async () => ({
            status: "succeeded",
            text: '<artifact><action type="file" filePath="app/page.tsx">export default function Page() { return (</action></artifact>',
            evidence: { status: "succeeded" }
          })
        }
      });
      const failedEvents = await drain(
        failingGen.runTurn({
          projectId,
          prompt: "Introduce an invalid page so the platform validation rollback is exercised.",
          actor
        })
      );
      assert.ok(
        failedEvents.some((event) => event.type === "error" && /validation/i.test(event.message))
      );
      assert.equal(
        failedEvents.some((event) => event.type === "commit"),
        false
      );

      const headAfterFailure = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        "cd /workspace && git -c safe.directory=/workspace rev-parse HEAD"
      ]);
      assert.equal(headAfterFailure.stdout.trim(), commit.sha);
      const pageAfterFailure = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        "cat /workspace/app/page.tsx"
      ]);
      assert.equal(pageAfterFailure.stdout, originalPage.stdout);
      const checkpointsAfterFailure = await client.workspaceCodeCheckpoint.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" }
      });
      assert.equal(
        checkpointsAfterFailure.length,
        1,
        "failed validation must not create a checkpoint"
      );
      const previewAfterFailure = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        'attempt=0; while [ "$attempt" -lt 30 ]; do curl -fsS "http://127.0.0.1:3000${EVCP_PREVIEW_BASE}/" >/dev/null 2>&1 && exit 0; attempt=$((attempt + 1)); sleep 1; done; exit 1'
      ]);
      assert.equal(
        previewAfterFailure.exitCode,
        0,
        "last-known-good preview must remain reachable"
      );

      await engine.stopContainer(record.containerId);
      await engine.removeContainer(record.containerId);
      orchestrator = createDefaultWorkspaceOrchestrator({ env });
      await orchestrator.hydrateRuntimeRecords(runtimeStore);
      record = await orchestrator.provisionWorkspace({ projectId, slug });
      const restartedGen = await createDefaultGenerationService({
        orchestrator,
        env,
        governedAiExecutor
      });
      const restartedHistory = await restartedGen.history(projectId);
      assert.ok(
        restartedHistory.length >= 4,
        "chat history must survive the API/workspace restart"
      );
      const restartedSource = await engine.execInContainer(record.containerId, [
        "sh",
        "-c",
        "cat /workspace/app/hello.txt"
      ]);
      assert.match(
        restartedSource.stdout,
        /HELLO_FROM_AI/,
        "source must survive container recreation"
      );
      const restartedCheckpoints = await client.workspaceCodeCheckpoint.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" }
      });
      assert.equal(restartedCheckpoints.length, 1);
      assert.equal(restartedCheckpoints[0].commitSha, commit.sha);
    } finally {
      await orchestrator.deleteWorkspace(projectId);
      await client.project.deleteMany({ where: { id: projectId } });
      await client.platformUser.deleteMany({ where: { id: actorId } });
      await client.$disconnect();
    }
  }
);
