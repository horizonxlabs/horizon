import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import {
  buildDevContainerSpec,
  createMemoryDockerEngine
} from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

const actor = {
  id: "creator-integration",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};

async function drain(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

async function memoryWorkspace() {
  const docker = createMemoryDockerEngine();
  const { containerId } = await docker.createContainer(
    buildDevContainerSpec({
      projectId: "project-flow",
      slug: "pi-flow",
      image: "workspace:test",
      env: {},
      cpuCores: 1,
      memoryMb: 512,
      network: "test"
    })
  );
  await docker.startContainer(containerId);
  const files = new Map([
    ["app/page.tsx", "export default function Page() { return <h1>Old</h1>; }"],
    ["lib/mock-data.ts", "export const rows = [];\n"]
  ]);
  const originalExec = docker.execInContainer.bind(docker);
  docker.execInContainer = async (id, command) => {
    await originalExec(id, command);
    if (command[0] !== "sh" || command[1] !== "-c") {
      return { stdout: command[0] === "pnpm" ? "checks passed\n" : "", stderr: "", exitCode: 0 };
    }
    const script = command[2] ?? "";
    const sizePath = script.match(/^wc -c < ([^ ]+)/)?.[1];
    if (sizePath) {
      const content = files.get(sizePath);
      return {
        stdout: `${content === undefined ? -1 : Buffer.byteLength(content, "utf8")}\n`,
        stderr: "",
        exitCode: 0
      };
    }
    const readPath = script.match(/^base64 ([^ ]+)/)?.[1];
    if (readPath) {
      const content = files.get(readPath);
      return {
        stdout:
          content === undefined
            ? "__EVCP_MISSING__\n"
            : `${Buffer.from(content).toString("base64")}\n`,
        stderr: "",
        exitCode: 0
      };
    }
    for (const match of script.matchAll(/echo ([A-Za-z0-9+/=]+) \| base64 -d > ([^ &]+)/g)) {
      files.set(match[2], Buffer.from(match[1], "base64").toString("utf8"));
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  docker.execInContainerStream = async (id, command, onChunk) => {
    await originalExec(id, command);
    onChunk("checks passed\n");
    return { exitCode: 0 };
  };
  return { docker, containerId, files };
}

test("native Pi tools preserve Creator SSE and the outer build transaction", async () => {
  const lifecycle = [];
  const { docker, containerId, files } = await memoryWorkspace();
  const migrations = createMemoryMigrationStore();
  const checkpoints = createMemoryCheckpointStore();
  const baseRunner = createActionRunner({ docker, migrations, checkpoints });
  const actionRunner = {
    async runAction(input) {
      lifecycle.push(`tool:${input.action.type}`);
      return baseRunner.runAction(input);
    },
    async syncMigrationArtifacts(input) {
      lifecycle.push("sync:migrations");
      return baseRunner.syncMigrationArtifacts(input);
    },
    async runMigrationBatch(input) {
      lifecycle.push("migrate:batch");
      return baseRunner.runMigrationBatch(input);
    }
  };
  const memoryHistory = createMemoryChatHistoryStore();
  const chatHistory = {
    ...memoryHistory,
    async appendMessage(message) {
      lifecycle.push(`append:${message.role}`);
      return memoryHistory.appendMessage(message);
    }
  };
  const script = [
    ["read_workspace_file", { path: "app/page.tsx" }],
    [
      "edit_workspace_file",
      { path: "app/page.tsx", find: "<h1>Old</h1>", replace: "<h1>Pipeline</h1>" }
    ],
    [
      "write_workspace_file",
      { path: "components/Pipeline.tsx", content: "export function Pipeline() { return null; }\n" }
    ],
    ["run_workspace_command", { command: "pnpm", args: ["test"] }],
    [
      "propose_database_migration",
      { name: "001_create_leads", sql: "CREATE TABLE leads(id text PRIMARY KEY)" }
    ],
    [
      "propose_database_migration",
      { name: "002_create_stages", sql: "CREATE TABLE stages(id text PRIMARY KEY)" }
    ]
  ];
  let round = 0;
  const governedAiExecutor = {
    async executeAgentRound(_actor, input) {
      const step = script[round++];
      return {
        status: "succeeded",
        message: step
          ? {
              role: "assistant",
              content: [
                {
                  type: "toolCall",
                  id: `call-${round}`,
                  name: step[0],
                  arguments: step[1]
                }
              ],
              timestamp: round
            }
          : {
              role: "assistant",
              content: [{ type: "text", text: "Sales Pipeline is ready." }],
              timestamp: round
            },
        usage: { input: 4, output: 2, totalTokens: 6, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const service = createPiGenerationService({
    governedAiExecutor,
    chatHistory,
    actionRunner,
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] },
    getContainerId: () => containerId,
    readContextFiles: async () => [...files].map(([path, content]) => ({ path, content })),
    readWorkspaceFiles: async (id) => {
      assert.equal(id, containerId);
      return [...files].map(([path, content]) => ({ path, content }));
    },
    workspaceGuard: {
      async prepare() {
        lifecycle.push("prepare:base");
        return "base-sha";
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {
        lifecycle.push("restore");
      }
    },
    async commitAllChanges() {
      lifecycle.push("commit:candidate");
      return "candidate-sha";
    },
    checkpoints: {
      async createCheckpoint(input) {
        lifecycle.push("checkpoint");
        return checkpoints.createCheckpoint(input);
      },
      listCheckpoints: (projectId) => checkpoints.listCheckpoints(projectId)
    },
    resolveGovernedContext: async () => ({
      availableSkills: [],
      skillInstructions: {},
      knowledgeExcerpts: [],
      productSpec: "Build a governed sales pipeline."
    }),
    onAudit(event) {
      lifecycle.push(`audit:${event.metadata.toolName}`);
    },
    limits: {
      maxModelRounds: 8,
      maxToolCalls: 12,
      shellTimeoutMs: 5_000,
      maxToolOutputBytes: 4_096,
      maxFileBytes: 20_000,
      maxToolInputBytes: 20_000,
      turnTimeoutMs: 30_000,
      validationRetries: 0
    }
  });

  const events = await drain(
    service.runTurn({
      projectId: "project-flow",
      prompt: "Build a Sales Pipeline with two migrations",
      agentMode: "build",
      actor
    })
  );

  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.equal(events.filter((event) => event.type === "action_start").length, 6);
  assert.equal(events.filter((event) => event.type === "action_result").length, 6);
  assert.equal(
    events.some((event) => event.type === "action_chunk"),
    true
  );
  assert.deepEqual(
    events.slice(-2).map((event) => event.type),
    ["commit", "done"]
  );
  assert.deepEqual(lifecycle, [
    "append:user",
    "prepare:base",
    "audit:read_workspace_file",
    "tool:edit",
    "audit:edit_workspace_file",
    "tool:file",
    "audit:write_workspace_file",
    "tool:shell",
    "audit:run_workspace_command",
    "audit:propose_database_migration",
    "audit:propose_database_migration",
    "validate",
    "sync:migrations",
    "commit:candidate",
    "migrate:batch",
    "checkpoint",
    "append:assistant"
  ]);
  assert.match(files.get("app/page.tsx"), /Pipeline/);
  assert.match(files.get("components/Pipeline.tsx"), /function Pipeline/);
  assert.deepEqual(
    (await migrations.listMigrations("project-flow")).map((migration) => migration.name),
    ["001_create_leads", "002_create_stages"]
  );
  const directCommand = docker.state.execCalls.find(({ cmd }) => cmd[0] === "pnpm");
  assert.deepEqual(directCommand?.cmd, ["pnpm", "test"]);
});
