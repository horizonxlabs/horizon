import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Coding AI has no legacy engine or markup parser", () => {
  const forbidden = [
    ["EVCP_AGENT", "ENGINE"].join("_"),
    ["LlmCompletion", "Client"].join(""),
    ["createMessage", "Parser"].join(""),
    ["governed", "Completion"].join(""),
    ["<action", " type="].join("")
  ].join("|");
  const result = spawnSync(
    "rg",
    [
      "-n",
      forbidden,
      "apps/platform-api/src/generation-loop",
      "apps/platform-api/src/app-factory.ts"
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `rg failed with ${result.status}`);
  }
  assert.equal(result.stdout.trim(), "");
});
