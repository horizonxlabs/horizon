import assert from "node:assert/strict";
import test from "node:test";

import { createHorizonPiTools } from "../../apps/platform-api/src/generation-loop/pi-tools.ts";

function fixture(overrides = {}) {
  const actionRunnerCalls = [];
  const migrationBuffer = [];
  const files = [
    { path: "app/page.tsx", content: "export default function Page() { return <h1>Old</h1>; }" },
    { path: "lib/mock-data.ts", content: "export const rows = [];" }
  ];
  const context = {
    projectId: "project-1",
    containerId: "container-1",
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] },
    actionRunner: {
      async runAction(input) {
        actionRunnerCalls.push(input);
        input.onShellOutput?.("streamed output");
        return { ok: true, stdout: input.action.type === "shell" ? "command output" : "" };
      },
      async runMigrationBatch() {
        throw new Error("migrations must be buffered");
      }
    },
    readWorkspaceFiles: async () => files,
    skillInstructions: { "frontend-design": "Use a deliberate visual hierarchy." },
    migrationBuffer,
    signal: new AbortController().signal,
    limits: {
      maxToolCalls: 20,
      maxToolInputBytes: 64_000,
      maxToolOutputBytes: 4_096,
      shellTimeoutMs: 30_000
    },
    nextToolCall() {},
    ...overrides
  };
  return { tools: createHorizonPiTools(context), actionRunnerCalls, migrationBuffer };
}

async function execute(tools, name, params, onUpdate) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool.execute(`call-${name}`, params, undefined, onUpdate, {});
}

test("exposes exactly seven project-bound Horizon tools", () => {
  const { tools } = fixture();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "read_workspace_file",
      "list_workspace_files",
      "write_workspace_file",
      "edit_workspace_file",
      "run_workspace_command",
      "propose_database_migration",
      "load_governed_skill"
    ]
  );
  for (const tool of tools) {
    assert.equal(tool.parameters.additionalProperties, false);
    assert.equal(Object.hasOwn(tool.parameters.properties, "projectId"), false);
    assert.equal(Object.hasOwn(tool.parameters.properties, "containerId"), false);
  }
});

test("read and list tools return bounded workspace context", async () => {
  const { tools, actionRunnerCalls } = fixture();
  const read = await execute(tools, "read_workspace_file", { path: "app/page.tsx" });
  const list = await execute(tools, "list_workspace_files", { prefix: "app" });

  assert.equal(read.details.ok, true);
  assert.match(read.content[0].text, /<h1>Old<\/h1>/);
  assert.equal(list.details.ok, true);
  assert.match(list.content[0].text, /app\/page\.tsx/);
  assert.equal(actionRunnerCalls.length, 0);
});

test("write, edit, and direct command tools delegate bound actions", async () => {
  const { tools, actionRunnerCalls } = fixture();
  const updates = [];
  const write = await execute(tools, "write_workspace_file", {
    path: "components/Card.tsx",
    content: "export function Card() { return null; }"
  });
  const edit = await execute(tools, "edit_workspace_file", {
    path: "app/page.tsx",
    find: "<h1>Old</h1>",
    replace: "<h1>New</h1>"
  });
  const shell = await execute(
    tools,
    "run_workspace_command",
    { command: "pnpm", args: ["test"], timeoutMs: 5_000 },
    (update) => updates.push(update)
  );

  assert.equal(write.details.actionType, "file");
  assert.equal(write.details.ok, true);
  assert.equal(edit.details.actionType, "edit");
  assert.equal(edit.details.ok, true);
  assert.equal(shell.details.actionType, "shell");
  assert.equal(shell.details.ok, true);
  assert.deepEqual(actionRunnerCalls[2].action, {
    id: "call-run_workspace_command",
    type: "shell",
    command: "pnpm",
    args: ["test"]
  });
  assert.equal(actionRunnerCalls[2].timeoutMs, 5_000);
  assert.match(updates[0].content[0].text, /streamed output/);
});

test("migration proposals are buffered and skills load progressively", async () => {
  const { tools, actionRunnerCalls, migrationBuffer } = fixture();
  const migration = await execute(tools, "propose_database_migration", {
    name: "create_contacts",
    sql: "CREATE TABLE contacts(id text PRIMARY KEY)"
  });
  const skill = await execute(tools, "load_governed_skill", { name: "frontend-design" });

  assert.equal(migration.details.actionType, "migration");
  assert.equal(migration.details.ok, true);
  assert.equal(migrationBuffer.length, 1);
  assert.equal(actionRunnerCalls.length, 0);
  assert.equal(skill.details.actionType, "skill");
  assert.match(skill.content[0].text, /deliberate visual hierarchy/);
});
