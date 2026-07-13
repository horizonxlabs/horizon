import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const workspaceRoot = "apps/creator-web/src/features/workspace";
const hookPath = `${workspaceRoot}/use-vibe-workspace.ts`;
const hookModules = ["use-project-files.ts", "use-vibe-chat.ts", "workspace-view-state.ts"];

test("Creator workspace composes focused hook modules without changing its public barrel", () => {
  const barrel = readFileSync(`${workspaceRoot}/index.ts`, "utf8");
  const hook = readFileSync(hookPath, "utf8");

  assert.match(barrel, /export \{ useVibeWorkspace \} from "\.\/use-vibe-workspace"/);
  for (const module of hookModules) {
    assert.equal(existsSync(`${workspaceRoot}/${module}`), true, `${module} should exist`);
    assert.ok(readFileSync(`${workspaceRoot}/${module}`, "utf8").split("\n").length <= 400);
  }
  assert.match(hook, /useProjectFiles/);
  assert.match(hook, /useVibeChat/);
  assert.match(hook, /workspaceViewState/);
});

test("Creator workspace initial state does not render fixture preview, task, or usage success data", () => {
  const viewState = readFileSync("apps/creator-web/src/features/workspace/workspace-view-state.ts", "utf8");
  assert.doesNotMatch(viewState, /fallbackPreview|fallbackTaskSteps|usageRows|local_workspace_task|local_usage/);
  assert.match(viewState, /version: "No preview yet"/);
});
