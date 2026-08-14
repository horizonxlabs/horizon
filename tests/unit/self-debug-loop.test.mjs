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
});
