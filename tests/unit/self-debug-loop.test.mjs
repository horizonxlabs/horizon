import test from "node:test";
import assert from "node:assert/strict";

const { createErrorTag, isPlatformFile, compileErrorFromTurn } = await import(
  "../../apps/platform-api/src/generation-loop/error-tags.ts"
);
const { collectPostTurnTags } = await import(
  "../../apps/platform-api/src/generation-loop/chat-route.ts"
);
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

test("platform files are classified so bugs blame the template, not the model", () => {
  const lockedFiles = ["platform.config.ts", "lib/storage.ts"];
  assert.equal(isPlatformFile("app/layout.tsx", lockedFiles), true); // template-shipped
  assert.equal(isPlatformFile("lib/storage.ts", lockedFiles), true);
  assert.equal(isPlatformFile("components/Dashboard.tsx", lockedFiles), false);
});

test("bug box classification: only post-write compile findings count, process noise stays out", () => {
  // Mid-turn action failures already surfaced in the chat stream — repeating them in the
  // bug box reads as gibberish to users ("refusing to overwrite..." on the Calibration case).
  assert.equal(
    compileErrorFromTurn(
      "Action failed after retries: refusing to overwrite the existing file 'app/page.tsx' (1200 bytes) with a whole-file write. Command: write app/page.tsx"
    ),
    null
  );
  assert.equal(compileErrorFromTurn("Attachment context failed"), null);
  assert.match(
    compileErrorFromTurn(
      "Write checks still failing: Syntax check failed for app/page.tsx:\napp/page.tsx(3,1): error TS1005"
    ),
    /Syntax check failed/
  );
  assert.match(
    compileErrorFromTurn("Build still failing after fixes: Type error: Property 'foo' does not exist"),
    /Type error/
  );
  assert.match(
    compileErrorFromTurn("Compile check failed: Type error: cannot return 1"),
    /Type error/
  );
});

test("compile prefixes stay pinned to the generation-loop wording", async () => {
  // error-tags cannot import these from the generation loop (generation-service sits at
  // the 400-line ratchet), so the wording is duplicated — this pin fails on any drift.
  const { readFile } = await import("node:fs/promises");
  const load = (file) =>
    readFile(new URL(`../../apps/platform-api/src/generation-loop/${file}`, import.meta.url), "utf8");
  const turnChecks = await load("turn-checks.ts");
  assert.match(turnChecks, /Write checks still failing: /);
  assert.match(turnChecks, /Build still failing after fixes: /);
  assert.match(await load("generation-service.ts"), /Compile check failed: /);
});

test("post-turn tags: compile errors become build bugs with a file, action failures don't", async () => {
  const tags = await collectPostTurnTags(
    { probeRuntime: async () => ({ status: 200, errors: [] }), templateLockedFiles: [] },
    "prj-abc",
    [
      "Action failed after retries: refusing to overwrite the existing file 'components/CertificateForm.tsx' (900 bytes) with a whole-file write. Command: write components/CertificateForm.tsx",
      "Write checks still failing: Syntax check failed for components/CertificateForm.tsx:\ncomponents/CertificateForm.tsx(10,5): error TS1005"
    ]
  );
  assert.equal(tags.length, 1);
  assert.equal(tags[0].source, "build");
  assert.equal(tags[0].file, "components/CertificateForm.tsx");
  assert.match(tags[0].message, /Syntax check failed/);
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
