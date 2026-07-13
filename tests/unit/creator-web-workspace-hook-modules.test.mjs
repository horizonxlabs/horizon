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
