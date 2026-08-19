import assert from "node:assert/strict";
import test from "node:test";

import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import { actor, baseDeps, drain } from "./helpers/pi-generation-service-streaming-lifecycle-fixtures.mjs";

// Regression for a production incident: a model wrote several real files successfully in
// one round, also tried (and failed) to rewrite package.json directly, then just narrated
// success and stopped instead of retrying within its own session. The old code aborted the
// whole turn on that one lingering failure and rolled back every file it DID write — a fully
// working feature silently vanished with no commit and no visible error. The turn now gets
// one explicit feedback round to route around a failure like this before giving up.

test("one lingering tool failure gets a feedback round instead of discarding the whole turn", async () => {
  const lifecycle = [];
  let modelRounds = 0;
  const executor = {
    async executeAgentRound(_actor, input) {
      modelRounds += 1;
      if (modelRounds === 1) {
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call-write-page",
                name: "write_workspace_file",
                arguments: { path: "app/page.tsx", content: "dashboard" }
              },
              {
                type: "toolCall",
                id: "call-write-pkg",
                name: "write_workspace_file",
                arguments: { path: "package.json", content: "{}" }
              }
            ],
            timestamp: 1
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
      if (modelRounds === 2) {
        // The model saw the package.json failure in its own session and just narrates
        // success anyway, without retrying it — this is what actually happened in production.
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Built the dashboard." }],
            timestamp: 2
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
      if (modelRounds === 3) {
        // Our explicit feedback round: the model now routes around the failure correctly.
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call-install",
                name: "run_workspace_command",
                arguments: { command: "npm", args: ["install", "lucide-react"] }
              }
            ],
            timestamp: 3
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
      return {
        status: "succeeded",
        message: { role: "assistant", content: [{ type: "text", text: "Fixed and done." }], timestamp: 4 },
        usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const deps = baseDeps(executor, lifecycle, true);
  deps.actionRunner.runAction = async (input) => {
    lifecycle.push(`tool:${input.action.type}:${input.action.filePath ?? input.action.command ?? ""}`);
    if (input.action.type === "file" && input.action.filePath === "package.json") {
      return { ok: false, error: "workspace path is outside an allowed project root" };
    }
    return { ok: true, stdout: "" };
  };

  const service = createPiGenerationService(deps);
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build a dashboard", agentMode: "build", actor })
  );

  assert.equal(modelRounds, 4);
  assert.equal(
    events.some((event) => event.type === "commit"),
    true
  );
  assert.equal(
    events.some((event) => event.type === "error"),
    false
  );
  assert.equal(lifecycle.includes("restore:base-sha"), false);
  assert.equal((await service.history("p1")).at(-1).commitSha, "candidate-sha");
});

test("a tool failure that survives the feedback round still rolls back the whole turn", async () => {
  const lifecycle = [];
  let modelRounds = 0;
  const executor = {
    async executeAgentRound(_actor, input) {
      modelRounds += 1;
      if (modelRounds === 1) {
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call-write-pkg",
                name: "write_workspace_file",
                arguments: { path: "package.json", content: "{}" }
              }
            ],
            timestamp: 1
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
      // Both the initial round and the one feedback round give up without fixing anything.
      return {
        status: "succeeded",
        message: { role: "assistant", content: [{ type: "text", text: "Done." }], timestamp: 2 },
        usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const deps = baseDeps(executor, lifecycle, true);
  deps.actionRunner.runAction = async () => ({
    ok: false,
    error: "workspace path is outside an allowed project root"
  });

  const service = createPiGenerationService(deps);
  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build a dashboard", agentMode: "build", actor })
  );

  // Round 1 fails, round 2 gives up without fixing it (ends the initial session), and the
  // one feedback retry (round 3) still doesn't fix it either.
  assert.equal(modelRounds, 3);
  assert.equal(events.some((event) => event.type === "commit"), false);
  assert.match(
    events.find((event) => event.type === "error")?.message ?? "",
    // package.json is on the fixture template's lockedFiles list, so the tool itself
    // rejects the write before actionRunner.runAction is ever called — this is the
    // real error a model sees, not the mocked actionRunner failure below.
    /package\.json.*is locked/
  );
  assert.equal(lifecycle.includes("restore:base-sha"), true);
});
