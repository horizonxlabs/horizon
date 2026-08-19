import assert from "node:assert/strict";
import test from "node:test";

import { createHorizonPiTools } from "../../apps/platform-api/src/generation-loop/pi-tools.ts";
import { normalizeProjectPath } from "../../apps/platform-api/src/generation-loop/pi-tool-policy.ts";

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
    "app/.git/config",
    "app/x; id",
    "app/x'quote.tsx",
    "app/$(id).tsx",
    "app/white space.tsx",
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

test("Pi tool boundary rejects interpreters, Git, file mutators, and package-manager escapes", async () => {
  const { tools, calls } = securedFixture();
  const invalid = [
    { command: "curl", args: ["https://example.test"] },
    { command: "pnpm;id", args: [] },
    { command: "docker", args: ["ps"] },
    { command: "node", args: ["/etc/passwd"] },
    { command: "node", args: ["-e", "console.log(process.env)"] },
    { command: "git", args: ["remote", "-v"] },
    { command: "find", args: ["."] },
    { command: "mkdir", args: ["app/new"] },
    { command: "cp", args: ["app/a", "app/b"] },
    { command: "mv", args: ["app/a", "app/b"] },
    { command: "sed", args: ["-i", "s/a/b/", "app/page.tsx"] },
    { command: "npx", args: ["next", "build"] },
    { command: "npm", args: ["view", "react"] },
    { command: "npm", args: ["exec", "node", "-e", "process.exit()"] },
    { command: "npm", args: ["run", "arbitrary-script"] },
    { command: "npm", args: ["run", "build", "--", "--config", "../unsafe.js"] },
    { command: "npm", args: ["install", "--prefix", "../outside", "react"] },
    { command: "npm", args: ["install", "file:../host-package"] },
    { command: "pnpm", args: ["dlx", "tsx", "script.ts"] },
    { command: "pnpm", args: ["exec", "node", "script.js"] },
    { command: "pnpm", args: ["x", "node", "script.js"] },
    { command: "pnpm", args: ["lint", "--fix"] }
  ];
  for (const params of invalid) {
    const result = await run(tools, "run_workspace_command", params);
    assert.equal(result.details.ok, false, JSON.stringify(params));
  }
  assert.equal(calls.length, 0);
});

test("workspace paths cannot target Git metadata", () => {
  assert.throws(() => normalizeProjectPath("app/.git/config"), /\.git|unsafe/i);
});

test("workspace path segments use a conservative shell-safe filename grammar", () => {
  for (const path of [
    "app/x; id",
    "app/x'quote.tsx",
    "app/$(id).tsx",
    "app/white space.tsx",
    "app/x\tname.tsx",
    'app/x"name.tsx',
    "app/x`id`.tsx",
    "app/x|id.tsx",
    "app/x&y.tsx",
    " app/page.tsx",
    "app/page.tsx "
  ]) {
    assert.throws(() => normalizeProjectPath(path), /unsafe/i, path);
  }
  assert.equal(
    normalizeProjectPath("app/@scope/card-view_v2+.tsx"),
    "app/@scope/card-view_v2+.tsx"
  );
});

// Regression: Pi kept hitting "workspace path contains an unsafe segment" on any Next.js
// dynamic route, then burned its reasoning budget thrashing over the false rejection instead
// of ever writing the file.
test("workspace paths allow Next.js dynamic-route segments", () => {
  for (const path of [
    "app/api/tasks/[id]/route.ts",
    "app/blog/[...slug]/page.tsx",
    "app/shop/[[...slug]]/page.tsx"
  ]) {
    assert.equal(normalizeProjectPath(path), path);
  }
  for (const path of [
    "app/api/tasks/[;id]/route.ts",
    "app/api/tasks/[[id]/route.ts",
    "app/api/tasks/[id]]/route.ts"
  ]) {
    assert.throws(() => normalizeProjectPath(path), /unsafe/i, path);
  }
});

test("Pi tool boundary permits only controlled installs and approved scripts", async () => {
  const { tools, calls } = securedFixture({
    limits: {
      maxToolCalls: 50,
      maxToolInputBytes: 4_096,
      maxToolOutputBytes: 256,
      shellTimeoutMs: 1_000
    }
  });
  const valid = [
    { command: "npm", args: ["install"] },
    { command: "npm", args: ["install", "--save-dev", "typescript@^5.9.0"] },
    { command: "npm", args: ["add", "@types/node@latest"] },
    { command: "pnpm", args: ["install"] },
    { command: "pnpm", args: ["add", "-D", "vitest@3.2.4"] },
    { command: "npm", args: ["run", "build"] },
    { command: "npm", args: ["test"] },
    { command: "pnpm", args: ["typecheck"] },
    { command: "pnpm", args: ["run", "lint"] }
  ];

  for (const params of valid) {
    const result = await run(tools, "run_workspace_command", params);
    assert.equal(result.details.ok, true, JSON.stringify(params));
  }
  assert.equal(calls.length, valid.length);
  assert.deepEqual(calls[0].action.args, ["install", "--ignore-scripts"]);
  assert.deepEqual(calls[1].action.args, [
    "install",
    "--ignore-scripts",
    "--save-dev",
    "typescript@^5.9.0"
  ]);
  assert.deepEqual(calls[4].action.args, ["add", "--ignore-scripts", "-D", "vitest@3.2.4"]);
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
