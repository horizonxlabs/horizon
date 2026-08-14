import test from "node:test";
import assert from "node:assert/strict";

const {
  AUTO_DEBUG_PREFIX,
  createErrorTag,
  createTagMemory,
  buildDebugPrompt,
  isPlatformFile
} = await import("../../apps/platform-api/src/generation-loop/error-tags.ts");
const { probeWorkspaceRuntime } = await import(
  "../../apps/platform-api/src/generation-loop/container-files.ts"
);

test("error tags carry a stable signature and dedupe across occurrences", () => {
  const first = createErrorTag("runtime", "Module not found: '@x/y'\n at layout.tsx", "app/layout.tsx");
  const again = createErrorTag("runtime", "Module not found: '@x/y'\n import trace differs", "app/layout.tsx");
  const other = createErrorTag("runtime", "Cannot read properties of undefined", "app/page.tsx");
  assert.equal(first.signature, again.signature);
  assert.notEqual(first.signature, other.signature);
});

test("tag memory allows exactly one auto-debug per signature", () => {
  const memory = createTagMemory();
  const tag = createErrorTag("build", "TS1005: '}' expected", "app/page.tsx");
  assert.deepEqual(memory.filterNew("prj_1", [tag]), [tag]);
  memory.markAttempted("prj_1", [tag]);
  assert.deepEqual(memory.filterNew("prj_1", [tag]), []);
  // other projects are unaffected
  assert.equal(memory.filterNew("prj_2", [tag]).length, 1);
});

test("debug prompt is fix-only, carries every tag, and flags rolled-back turns", () => {
  const tags = [
    createErrorTag("runtime", "500 at /preview: Module not found '@fontsource-variable/anuphan/thai.css'", "app/layout.tsx"),
    createErrorTag("build", "TS1005: '}' expected", "app/page.tsx")
  ];
  const prompt = buildDebugPrompt(tags, { previousTurnRolledBack: false });
  assert.ok(prompt.startsWith(AUTO_DEBUG_PREFIX));
  assert.match(prompt, /Module not found/);
  assert.match(prompt, /'}' expected/);
  assert.match(prompt, /fix only|ONLY these/i);
  assert.doesNotMatch(prompt, /rolled back/i);
  const rolled = buildDebugPrompt(tags, { previousTurnRolledBack: true });
  assert.match(rolled, /rolled back/i);
  // default (failed work is KEPT now): repair in place, never rebuild from scratch
  assert.match(prompt, /STILL PRESENT/);
  assert.match(prompt, /IN PLACE/);
  assert.match(prompt, /do NOT recreate existing files/i);
});

test("attempt budget caps repairs per window even when signatures keep changing", () => {
  const memory = createTagMemory();
  const t0 = 1_000_000;
  assert.equal(memory.allowAttempt("prj_1", t0), true);
  memory.markAttempted("prj_1", [createErrorTag("build", "err A")], t0);
  assert.equal(memory.allowAttempt("prj_1", t0 + 1000), true);
  memory.markAttempted("prj_1", [createErrorTag("build", "err B")], t0 + 1000);
  // third new signature inside the window: budget exhausted — back to the user
  assert.equal(memory.allowAttempt("prj_1", t0 + 2000), false);
  // window expiry restores the budget
  assert.equal(memory.allowAttempt("prj_1", t0 + 11 * 60 * 1000), true);
});

test("platform files are classified so bugs blame the template, not the model", () => {
  const lockedFiles = ["platform.config.ts", "lib/storage.ts"];
  assert.equal(isPlatformFile("app/layout.tsx", lockedFiles), true); // template-shipped
  assert.equal(isPlatformFile("lib/storage.ts", lockedFiles), true);
  assert.equal(isPlatformFile("components/Dashboard.tsx", lockedFiles), false);
});

test("runtime probe reports non-200 pages with the error excerpt", async () => {
  const docker = {
    async execInContainer() {
      return {
        stdout: "STATUS:500\nEXCERPT:Error: something exploded in ./app/page.tsx\n"
      };
    }
  };
  const result = await probeWorkspaceRuntime(docker, "c1", "prj-abc");
  assert.equal(result.status, 500);
  assert.match(result.errors[0], /exploded/);
  const healthy = await probeWorkspaceRuntime(
    { async execInContainer() { return { stdout: "STATUS:200\n" }; } },
    "c1",
    "prj-abc"
  );
  assert.equal(healthy.status, 200);
  assert.deepEqual(healthy.errors, []);
  // timeout / mid-compile (status 0) is probe uncertainty, never a user-facing error
  const compiling = await probeWorkspaceRuntime(
    { async execInContainer() { return { stdout: "STATUS:0\n" }; } },
    "c1",
    "prj-abc"
  );
  assert.deepEqual(compiling.errors, []);
});

const { loadGoldenTemplate } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/template.ts"
);

test("template ships the error relay + boundary and mounts them in the layout", () => {
  const template = loadGoldenTemplate();
  const relay = template.files.find((file) => file.path === "components/dev-error-relay.tsx");
  const boundary = template.files.find((file) => file.path === "components/error-boundary.tsx");
  assert.ok(relay && boundary, "relay and boundary must ship with every app");
  assert.match(relay.content, /^"use client";/);
  assert.match(relay.content, /window\.parent === window\) return/);
  assert.match(relay.content, /evcp:preview-error/);
  assert.match(relay.content, /REPORT_INTERVAL_MS/); // debounced — a crash loop must not spam
  assert.match(boundary.content, /getDerivedStateFromError/);
  const layout = template.files.find((file) => file.path === "app/layout.tsx");
  assert.match(layout.content, /DevErrorRelay/);
  assert.match(layout.content, /AppErrorBoundary/);
});
