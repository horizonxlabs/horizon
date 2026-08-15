import assert from "node:assert/strict";
import test from "node:test";

import { runStartupCommands } from "../../scripts/dev/setup-runner.mjs";

test("development startup generates env and passes preflight before Compose starts", () => {
  const calls = [];

  runStartupCommands({
    ensureEnv: () => calls.push("env"),
    runPreflight: () => calls.push("preflight"),
    buildWorkspaceImage: () => calls.push("workspace-image"),
    prepareCompose: () => calls.push("prepare-compose"),
    startCompose: () => calls.push("compose")
  });

  assert.deepEqual(calls, ["env", "preflight", "workspace-image", "prepare-compose", "compose"]);
});

test("development startup does not invoke Compose after a preflight failure", () => {
  const calls = [];

  assert.throws(
    () =>
      runStartupCommands({
        ensureEnv: () => calls.push("env"),
        runPreflight: () => {
          calls.push("preflight");
          throw new Error("preflight failed");
        },
        buildWorkspaceImage: () => calls.push("workspace-image"),
        prepareCompose: () => calls.push("prepare-compose"),
        startCompose: () => calls.push("compose")
      }),
    /preflight failed/
  );

  assert.deepEqual(calls, ["env", "preflight"]);
});
