import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { createContainerFileReader, listWorkspaceTree } =
  await import("../../apps/platform-api/src/generation-loop/container-files.ts");

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

test("prompt exposes only bounded native Horizon workspace tools", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /list_workspace_files/);
  assert.match(prompt, /read_workspace_file/);
  assert.match(prompt, /run_workspace_command/);
  assert.match(prompt, /npm or pnpm.*install\/add.*build, test, typecheck, or lint/is);
  assert.match(prompt, /Never use node, npx, git.*exec\/dlx\/x.*arbitrary package scripts/is);
});

test("prompt treats embedded context as inspected and avoids duplicate final validation", () => {
  const prompt = buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [{ path: "app/page.tsx", content: "export default function Page() {}" }],
    rollingSummary: null
  });

  assert.match(prompt, /Current project files.*already inspected/is);
  assert.match(prompt, /Horizon runs final validation/i);
  assert.match(prompt, /run.*build.*only.*diagnos/is);
  assert.doesNotMatch(
    prompt,
    /Inspect before changing: use list_workspace_files and read_workspace_file/
  );
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
