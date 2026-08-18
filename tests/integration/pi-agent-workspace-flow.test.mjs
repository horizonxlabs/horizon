import assert from "node:assert/strict";
import test from "node:test";

import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryChatHistoryStore } from "../../apps/platform-api/src/generation-loop/chat-history-store.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import {
  actor,
  drain,
  instrumentedCheckpoints,
  memoryWorkspace,
  scriptedGovernedAiExecutor
} from "./helpers/pi-agent-workspace-flow-fixtures.mjs";

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
      async hasChanges(_projectId, snapshot) {
        assert.equal(snapshot, "base-sha");
        lifecycle.push("git:changes");
        return true;
      },
      async validate() {
        lifecycle.push("validate");
      },
      async restore() {},
      async restoreSnapshot() {
        lifecycle.push("restore");
      },
      async releaseSnapshot() {}
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
      lifecycle.push(
        event.action === "workspace_snapshot_release"
          ? `audit:snapshot-release:${event.metadata.ok}`
          : `audit:${event.metadata.toolName}`
      );
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
    "git:changes",
    "validate",
    "sync:migrations",
    "git:changes",
    "commit:candidate",
    "migrate:batch",
    "checkpoint",
    "append:assistant",
    "audit:snapshot-release:true"
  ]);
  assert.match(files.get("app/page.tsx"), /Pipeline/);
  assert.match(files.get("components/Pipeline.tsx"), /function Pipeline/);
  assert.deepEqual(
    (await migrations.listMigrations("project-flow")).map((migration) => migration.name),
    ["001_create_leads", "002_create_stages"]
  );
  // Shell actions now route through the process-group-tracking wrapper, so the exec call
  // is `sh -c <root script>` and the actual `su -s /bin/sh evcp -c 'cd /workspace && exec pnpm test' &`
  // invocation lives (nested-quoted) inside that root script's text rather than being the
  // exec argv itself.
  const directCommand = docker.state.execCalls.find(
    ({ cmd }) =>
      cmd[0] === "sh" &&
      cmd[1] === "-c" &&
      /su -s \/bin\/sh evcp -c/.test(cmd[2] ?? "") &&
      /cd \/workspace && exec/.test(cmd[2] ?? "") &&
      /pnpm/.test(cmd[2] ?? "") &&
      /test/.test(cmd[2] ?? "")
  );
  assert.ok(directCommand, "expected a process-group-wrapped pnpm test invocation");
});

test("Auto mode informational turn makes no commit, validate, or checkpoint calls", async () => {
  const { docker, containerId, files } = await memoryWorkspace();
  const migrations = createMemoryMigrationStore();
  const checkpointStore = createMemoryCheckpointStore();
  const actionRunner = createActionRunner({ docker, migrations, checkpoints: checkpointStore });
  const chatHistory = createMemoryChatHistoryStore();

  const workspaceGuard = {
    validateCalls: 0,
    async prepare() {
      return "base-sha";
    },
    async hasChanges() {
      return false;
    },
    async validate() {
      workspaceGuard.validateCalls += 1;
    },
    async restore() {},
    async restoreSnapshot() {},
    async releaseSnapshot() {}
  };
  let commitCalls = 0;
  let checkpointCalls = 0;

  const service = createPiGenerationService({
    governedAiExecutor: scriptedGovernedAiExecutor(
      [["read_workspace_file", { path: "app/page.tsx" }]],
      "This reads directly from the in-memory workspace files."
    ),
    chatHistory,
    actionRunner,
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] },
    getContainerId: () => containerId,
    readContextFiles: async () => [...files].map(([path, content]) => ({ path, content })),
    readWorkspaceFiles: async () => [...files].map(([path, content]) => ({ path, content })),
    workspaceGuard,
    async commitAllChanges() {
      commitCalls += 1;
      return "should-not-be-called-sha";
    },
    checkpoints: instrumentedCheckpoints(checkpointStore, () => {
      checkpointCalls += 1;
    }),
    resolveGovernedContext: async () => ({
      availableSkills: [],
      skillInstructions: {},
      knowledgeExcerpts: [],
      productSpec: "Build a governed sales pipeline."
    }),
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
      projectId: "project-flow-info",
      prompt: "Where does this data come from right now?",
      agentMode: "auto",
      actor
    })
  );

  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal(events.at(-1)?.type, "done");
  assert.equal(workspaceGuard.validateCalls, 0);
  assert.equal(commitCalls, 0);
  assert.equal(checkpointCalls, 0);
});

test("Auto mode mutation turn validates once, commits once, and checkpoints once", async () => {
  const { docker, containerId, files } = await memoryWorkspace();
  const migrations = createMemoryMigrationStore();
  const checkpointStore = createMemoryCheckpointStore();
  const actionRunner = createActionRunner({ docker, migrations, checkpoints: checkpointStore });
  const chatHistory = createMemoryChatHistoryStore();

  const workspaceGuard = {
    validateCalls: 0,
    async prepare() {
      return "base-sha";
    },
    async hasChanges() {
      // The scripted mutation always leaves the workspace Git tree dirty.
      return true;
    },
    async validate() {
      workspaceGuard.validateCalls += 1;
    },
    async restore() {},
    async restoreSnapshot() {},
    async releaseSnapshot() {}
  };
  let commitCalls = 0;
  let checkpointCalls = 0;

  const service = createPiGenerationService({
    governedAiExecutor: scriptedGovernedAiExecutor(
      [
        [
          "write_workspace_file",
          { path: "components/AutoNote.tsx", content: "export const AutoNote = 1;\n" }
        ]
      ],
      "Added the AutoNote component."
    ),
    chatHistory,
    actionRunner,
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] },
    getContainerId: () => containerId,
    readContextFiles: async () => [...files].map(([path, content]) => ({ path, content })),
    readWorkspaceFiles: async () => [...files].map(([path, content]) => ({ path, content })),
    workspaceGuard,
    async commitAllChanges() {
      commitCalls += 1;
      return "auto-mutation-sha";
    },
    checkpoints: instrumentedCheckpoints(checkpointStore, () => {
      checkpointCalls += 1;
    }),
    resolveGovernedContext: async () => ({
      availableSkills: [],
      skillInstructions: {},
      knowledgeExcerpts: [],
      productSpec: "Build a governed sales pipeline."
    }),
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
      projectId: "project-flow-mutation",
      prompt: "Add an AutoNote component",
      agentMode: "auto",
      actor
    })
  );

  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.deepEqual(events.slice(-2).map((event) => event.type), ["commit", "done"]);
  assert.equal(events.filter((event) => event.type === "commit").length, 1);
  assert.equal(workspaceGuard.validateCalls, 1);
  assert.equal(commitCalls, 1);
  assert.equal(checkpointCalls, 1);
  assert.match(files.get("components/AutoNote.tsx"), /AutoNote/);
});
