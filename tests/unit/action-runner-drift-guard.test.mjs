import test from "node:test";
import assert from "node:assert/strict";
import { createActionRunner } from "../../apps/platform-api/src/generation-loop/action-runner.ts";
import { createMemoryCheckpointStore } from "../../apps/platform-api/src/generation-loop/checkpoint-store.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

// Drift guard: a whole-file write to a substantial existing file is rejected and redirected to edit.
function stubDockerWithSizes(sizeByPath) {
  const execCalls = [];
  return {
    state: { execCalls },
    async execInContainer(containerId, cmd) {
      execCalls.push({ containerId, cmd });
      const script = cmd[cmd.length - 1] || "";
      const m = script.match(/wc -c < (\S+)/);
      if (m) return { stdout: String(sizeByPath[m[1]] ?? -1), stderr: "", exitCode: 0 };
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}

test("drift guard: rejects a whole-file write to a large existing file, steering to edit", async () => {
  const docker = stubDockerWithSizes({ "app/page.tsx": 5000 });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "file", filePath: "app/page.tsx", content: "whole new file" }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /edit/i);
  // it must NOT have written anything (no base64 decode write)
  assert.ok(!docker.state.execCalls.some((c) => (c.cmd.at(-1) || "").includes("base64 -d")));
});

test("drift guard: a DIFFERING whole-file rewrite is rejected WITH the current content so the retry can edit", async () => {
  // The CMMS case: the model could not see the file's exact bytes, so its SEARCH blocks
  // never matched and it fell back to (blocked) whole-file writes until retries ran out.
  const current = "export function TicketDialog() { return null; }\n" + "// filler\n".repeat(500);
  const docker = stubDockerWithSizes({ "components/maintenance/TicketDialog.tsx": 5047 });
  const baseExec = docker.execInContainer.bind(docker);
  docker.execInContainer = async (containerId, cmd) => {
    const script = cmd[cmd.length - 1] || "";
    if (script.startsWith("base64 components/maintenance/TicketDialog.tsx")) {
      docker.state.execCalls.push({ containerId, cmd });
      return { stdout: Buffer.from(current, "utf8").toString("base64"), stderr: "", exitCode: 0 };
    }
    return baseExec(containerId, cmd);
  };
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: {
      id: "a1",
      type: "file",
      filePath: "components/maintenance/TicketDialog.tsx",
      content: "totally different content"
    }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /edit/i);
  assert.match(result.error, /export function TicketDialog/, "current content rides along for exact SEARCH text");
});

test("drift guard: an IDENTICAL whole-file re-write is a no-op success, never an overwrite error", async () => {
  // The model losing track of its own progress re-sends files it already wrote; failing
  // that burned whole turns on "refusing to overwrite" retries (the Calibration case).
  const content = "x".repeat(5000);
  const docker = stubDockerWithSizes({ "app/page.tsx": 5000 });
  const baseExec = docker.execInContainer.bind(docker);
  docker.execInContainer = async (containerId, cmd) => {
    const script = cmd[cmd.length - 1] || "";
    if (script.startsWith("base64 app/page.tsx")) {
      docker.state.execCalls.push({ containerId, cmd });
      return { stdout: Buffer.from(content, "utf8").toString("base64"), stderr: "", exitCode: 0 };
    }
    return baseExec(containerId, cmd);
  };
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "file", filePath: "app/page.tsx", content }
  });
  assert.equal(result.ok, true);
  assert.match(result.stdout, /already/i);
  // nothing rewritten on disk
  assert.ok(!docker.state.execCalls.some((c) => (c.cmd.at(-1) || "").includes("base64 -d")));
});

test("drift guard: allows a whole-file write to a small existing file (weaker models do this reliably)", async () => {
  const docker = stubDockerWithSizes({ "app/api/route.ts": 700 });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const result = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "file", filePath: "app/api/route.ts", content: "export const GET = () => Response.json({ ok: true });\n" }
  });
  assert.equal(result.ok, true);
  assert.ok(docker.state.execCalls.some((c) => (c.cmd.at(-1) || "").includes("base64 -d")));
});


test("drift guard: allows a whole-file write to the tiny starter (first build) and to new files", async () => {
  const docker = stubDockerWithSizes({ "app/page.tsx": 115, "app/new.tsx": -1 });
  const runner = createActionRunner({
    docker,
    checkpoints: createMemoryCheckpointStore(),
    migrations: createMemoryMigrationStore()
  });
  const starter = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a1", type: "file", filePath: "app/page.tsx", content: "real homepage" }
  });
  assert.equal(starter.ok, true, "starter-size file may be overwritten");
  const created = await runner.runAction({
    containerId: "c1",
    projectId: "p1",
    template,
    action: { id: "a2", type: "file", filePath: "app/new.tsx", content: "brand new" }
  });
  assert.equal(created.ok, true, "new file may be created");
});
