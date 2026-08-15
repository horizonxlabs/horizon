import assert from "node:assert/strict";
import test from "node:test";

import { createHorizonPiTools } from "../../apps/platform-api/src/generation-loop/pi-tools.ts";

function securedFixture(overrides = {}) {
  const calls = [];
  let used = 0;
  const controller = new AbortController();
  const context = {
    projectId: "project-safe",
    containerId: "container-safe",
    template: { name: "Web App", lockedFiles: ["app/locked.tsx"], files: [] },
    actionRunner: {
      async runAction(input) {
        calls.push(input);
        return { ok: true, stdout: "ok" };
      },
      async runMigrationBatch() {
        throw new Error("not expected");
      }
    },
    readWorkspaceFiles: async () => [
      { path: "app/page.tsx", content: "same same" },
      { path: "app/unique.tsx", content: "before" },
      { path: "app/locked.tsx", content: "locked" },
      { path: "lib/large.ts", content: "x".repeat(200) }
    ],
    skillInstructions: {},
    migrationBuffer: [],
    signal: controller.signal,
    limits: {
      maxToolCalls: 50,
      maxToolInputBytes: 64,
      maxToolOutputBytes: 48,
      shellTimeoutMs: 1_000
    },
    nextToolCall() {
      used += 1;
      if (used > 50) throw new Error("tool call budget exceeded");
    },
    ...overrides
  };
  return { tools: createHorizonPiTools(context), calls, controller };
}

async function run(tools, name, params, signal) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool);
  return tool.execute("call-security", params, signal, undefined, {});
}

test("rejects unsafe paths, locked writes, and non-unique edits before action runner", async () => {
  const { tools, calls } = securedFixture();
  for (const path of [
    "../secret",
    "/etc/passwd",
    "app\\page.tsx",
    "app/../secret",
    "app/\u0000x"
  ]) {
    const result = await run(tools, "read_workspace_file", { path });
    assert.equal(result.details.ok, false, path);
  }
  assert.equal(
    (await run(tools, "write_workspace_file", { path: "app/locked.tsx", content: "x" })).details.ok,
    false
  );
  assert.equal(
    (
      await run(tools, "edit_workspace_file", {
        path: "app/page.tsx",
        find: "same",
        replace: "new"
      })
    ).details.ok,
    false
  );
  assert.equal(
    (
      await run(tools, "edit_workspace_file", {
        path: "app/unique.tsx",
        find: "missing",
        replace: "new"
      })
    ).details.ok,
    false
  );
  assert.equal(calls.length, 0);
});

test("reports a locked root manifest instead of misclassifying it as outside the project", async () => {
  const { tools, calls } = securedFixture({
    template: { name: "Web App", lockedFiles: ["package.json"], files: [] }
  });

  const result = await run(tools, "write_workspace_file", {
    path: "package.json",
    content: "{}"
  });

  assert.equal(result.details.ok, false);
  assert.equal(result.details.error, "workspace file 'package.json' is locked");
  assert.equal(calls.length, 0);
});

test("rejects oversized inputs and clips workspace output by UTF-8 bytes", async () => {
  const { tools, calls } = securedFixture();
  const write = await run(tools, "write_workspace_file", {
    path: "app/new.tsx",
    content: "🔥".repeat(40)
  });
  const read = await run(tools, "read_workspace_file", { path: "lib/large.ts" });

  assert.equal(write.details.ok, false);
  assert.match(write.details.error, /input.*limit/i);
  assert.ok(Buffer.byteLength(read.content[0].text, "utf8") <= 80);
  assert.match(read.content[0].text, /truncated/i);
  assert.equal(calls.length, 0);
});

test("allows only direct safe commands and arguments", async () => {
  const { tools, calls } = securedFixture();
  const invalid = [
    { command: "curl", args: ["https://example.test"] },
    { command: "pnpm;id", args: [] },
    { command: "docker", args: ["ps"] },
    { command: "node", args: ["/etc/passwd"] },
    { command: "node", args: ["-e", "console.log(process.env)"] },
    { command: "git", args: ["remote", "-v"] },
    { command: "npm", args: ["view", "react"] },
    { command: "ls", args: ["bad\u0000arg"] }
  ];
  for (const params of invalid) {
    const result = await run(tools, "run_workspace_command", params);
    assert.equal(result.details.ok, false, JSON.stringify(params));
  }
  assert.equal(calls.length, 0);
});

test("rejects transaction control, invalid migration names, aborts, and tool-budget overflow", async () => {
  const { tools, calls, controller } = securedFixture();
  const transaction = await run(tools, "propose_database_migration", {
    name: "unsafe",
    sql: "BEGIN; CREATE TABLE x(id text); COMMIT;"
  });
  const name = await run(tools, "propose_database_migration", {
    name: "../unsafe",
    sql: "CREATE TABLE x(id text)"
  });
  assert.equal(transaction.details.ok, false);
  assert.equal(name.details.ok, false);

  controller.abort();
  const aborted = await run(tools, "list_workspace_files", {});
  assert.equal(aborted.details.ok, false);
  assert.match(aborted.details.error, /aborted/i);

  const limited = securedFixture({
    nextToolCall: () => {
      throw new Error("tool call budget exceeded");
    }
  });
  const over = await run(limited.tools, "list_workspace_files", {});
  assert.equal(over.details.ok, false);
  assert.match(over.details.error, /budget/i);
  assert.equal(calls.length, 0);
  assert.equal(limited.calls.length, 0);
});
