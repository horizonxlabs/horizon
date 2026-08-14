import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { createContainerFileReader, listWorkspaceTree } = await import(
  "../../apps/platform-api/src/generation-loop/container-files.ts"
);

function buildPrompt(fileTree) {
  return buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null,
    ...(fileTree ? { fileTree } : {})
  });
}

test("prompt shows the full file tree and forbids recreating what exists", () => {
  const prompt = buildPrompt(["app/page.tsx", "components/ui/button.tsx", "lib/mock-data.ts"]);
  assert.match(prompt, /## Project file tree/);
  assert.match(prompt, /components\/ui\/button\.tsx/);
  assert.match(prompt, /lib\/mock-data\.ts/);
  assert.match(prompt, /never recreate/i);
});

test("prompt pins the dashboard kit's EXACT prop signatures (the CMMS misuse case)", () => {
  // The model once invented appName/navItems on AppShell and passed an object into
  // StatCard's string prop — the first build compiled broken and crashed the preview.
  const prompt = buildPrompt();
  assert.match(prompt, /StatCard \{label: string; value: string/);
  assert.match(prompt, /AppShell \{brand: ReactNode; nav: ReactNode/);
  assert.match(prompt, /AppShellNavItem \{href: string/);
  assert.match(prompt, /NO appName\/navItems/);
});

test("prompt states the preinstalled deps and the no-cd shell rule", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /clsx/);
  assert.match(prompt, /tailwind-merge/);
  assert.match(prompt, /lucide-react/);
  assert.match(prompt, /never run npm install for these/i);
  assert.match(prompt, /do NOT cd/i);
});

test("context file contents prioritize app and lib before the large ui kit", async () => {
  let seen = "";
  const docker = {
    async execInContainer(_id, cmd) {
      seen = cmd[2];
      return { stdout: "" };
    }
  };
  await createContainerFileReader(docker).read("c1");
  assert.match(seen, /find app lib components/);
});

test("listWorkspaceTree returns every path without a content cap", async () => {
  const docker = {
    async execInContainer() {
      return { stdout: "app/page.tsx\r\nlib/mock-data.ts\ncomponents/ui/button.tsx\n" };
    }
  };
  const tree = await listWorkspaceTree(docker, "c1");
  assert.deepEqual(tree, ["app/page.tsx", "components/ui/button.tsx", "lib/mock-data.ts"]);
});
