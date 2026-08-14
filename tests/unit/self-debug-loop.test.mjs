import test from "node:test";
import assert from "node:assert/strict";

const { createErrorTag, isPlatformFile } = await import(
  "../../apps/platform-api/src/generation-loop/error-tags.ts"
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
