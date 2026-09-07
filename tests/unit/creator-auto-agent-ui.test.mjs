import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Creator exposes one Horizon composer without persistent Plan Build state", async () => {
  const page = await readFile("apps/creator-web/src/features/workspace/WorkspacePage.tsx", "utf8");
  const hook = await readFile("apps/creator-web/src/features/workspace/use-vibe-chat.ts", "utf8");
  const workspace = await readFile(
    "apps/creator-web/src/features/workspace/use-vibe-workspace.ts",
    "utf8"
  );
  const chrome = await readFile(
    "apps/creator-web/src/features/workspace/workspace-chrome.ts",
    "utf8"
  );
  const stream = await readFile("apps/creator-web/src/features/workspace/vibe-stream.ts", "utf8");
  const styles = await readFile("packages/ui/styles.css", "utf8");

  assert.doesNotMatch(page, /MODE_OPTIONS|Workspace mode|Plan with AI|Build with AI/);
  assert.doesNotMatch(page, /handleVibeChat\(\{[^}]*mode:/s);
  assert.doesNotMatch(
    workspace,
    /localStorage|readWorkspaceMode|persistWorkspaceMode|workspaceMode/
  );
  assert.doesNotMatch(chrome, /MODE_OPTIONS|ClipboardList|Hammer|WorkspaceAgentMode/);
  assert.match(hook, /mode\s*=\s*overrides\?\.mode\s*\?\?\s*"auto"/);
  assert.match(hook, /if \(mode !== "plan"\) await ensureVibeWorkspace/);
  assert.match(hook, /enqueuePrompt\(queue, \{ prompt, mode \}\)/);
  // Preview refresh is driven by commit evidence from the stream, not by the request mode.
  assert.match(
    hook,
    /else if \(type === "commit"\) \{[\s\S]*?setVibePreviewKey\(\(key\) => key \+ 1\);[\s\S]*?\} else if \(type === "error"\)/
  );
  assert.doesNotMatch(hook, /if \(mode === "build"\) setVibePreviewKey/);
  // Outcome status is independent of the hidden request mode; detailed action evidence remains in
  // the streamed action collection rather than changing the header to implementation jargon.
  assert.match(hook, /workspaceOutcomeForEvent/);
  assert.doesNotMatch(hook, /"Planning…"|"Thinking…"|"Plan mode: read-only"/);
  assert.doesNotMatch(hook, /Provisioning workspace…/);
  assert.doesNotMatch(hook, /"AI is working…"/);
  assert.match(stream, /mode:\s*"build"/);
  assert.match(page, /Create and understand your app with Horizon/);
  assert.match(
    page,
    /Ask Horizon about the app or describe a change\. Files change only when your request asks for it\./
  );
  assert.match(page, /Ask Horizon about the app or describe a change…/);
  assert.doesNotMatch(page, /Ask Pi/);
  assert.match(page, /Stop generation/);
  assert.match(page, /Send prompt/);
  assert.doesNotMatch(styles, /\.vibe-mode-(?:switch|option)/);
  await assert.rejects(
    readFile("apps/creator-web/src/features/workspace/workspace-mode.ts", "utf8"),
    { code: "ENOENT" }
  );
});
