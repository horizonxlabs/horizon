import assert from "node:assert/strict";
import test from "node:test";

import { createPiGenerationService } from "../../apps/platform-api/src/generation-loop/pi-generation-service.ts";
import { actor, baseDeps, drain } from "./helpers/pi-generation-service-streaming-lifecycle-fixtures.mjs";

test("the turn token budget stops a runaway Pi loop and restores the workspace", async () => {
  const lifecycle = [];
  let rounds = 0;
  const deps = baseDeps(
    {
      async executeAgentRound(_actor, input) {
        rounds += 1;
        const message =
          rounds === 1
            ? {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    id: "call-write",
                    name: "write_workspace_file",
                    arguments: { path: "app/page.tsx", content: "export default function Page(){}" }
                  }
                ],
                timestamp: 1
              }
            : {
                role: "assistant",
                content: [{ type: "text", text: "Finished" }],
                timestamp: 2
              };
        return {
          status: "succeeded",
          message,
          usage: { input: 5, output: 1, totalTokens: 6, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    lifecycle,
    true
  );
  deps.limits.maxTurnTokens = 10;
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build dashboard", agentMode: "build", actor })
  );

  assert.equal(rounds, 2);
  assert.match(events.find((event) => event.type === "error")?.message ?? "", /token budget/i);
  assert.equal(
    events.some((event) => event.type === "commit"),
    false
  );
  assert.equal(lifecycle.includes("restore:base-sha"), true);
});

// Regression: promptTokens/completionTokens accumulate across every round of the turn, so a
// legitimate multi-round build (e.g. wiring up a real database) can land well past the old
// 160k default without doing anything runaway — and used to have its real, working mutations
// silently discarded by the same rollback path a genuine stall takes. Two rounds here sum to
// 210,000 tokens: over the old default, under the current one — the turn must still commit.
test("a multi-round build that legitimately needs more than the old 160k default still commits", async () => {
  const lifecycle = [];
  let rounds = 0;
  const deps = baseDeps(
    {
      async executeAgentRound(_actor, input) {
        rounds += 1;
        const message =
          rounds === 1
            ? {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    id: "call-write",
                    name: "write_workspace_file",
                    arguments: { path: "app/page.tsx", content: "export default function Page(){}" }
                  }
                ],
                timestamp: 1
              }
            : {
                role: "assistant",
                content: [{ type: "text", text: "Wired up the real Postgres database." }],
                timestamp: 2
              };
        return {
          status: "succeeded",
          message,
          usage: { input: 100_000, output: 5_000, totalTokens: 105_000, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    lifecycle,
    true
  );
  deps.limits.maxTurnTokens = 600_000;
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Wire up the real database", agentMode: "build", actor })
  );

  assert.equal(rounds, 2);
  assert.equal(events.some((event) => event.type === "error"), false);
  assert.equal(events.some((event) => event.type === "commit"), true);
  assert.equal(lifecycle.includes("restore:base-sha"), false);
});

// Mimics the observed failure: the model oscillates between two plans forever instead of
// ever converging on a tool call, which used to burn the full 5-minute round timeout.
test("a round that deliberates without ever calling a tool is cut off by the reasoning budget", async () => {
  const lifecycle = [];
  const thinking = "Actually, I'll do the DB migration first. Actually, BTC real-time first. ".repeat(20);
  const message = { role: "assistant", content: [{ type: "thinking", thinking }], timestamp: 1 };
  const deps = baseDeps(
    {
      async executeAgentRound(_actor, input) {
        return {
          status: "succeeded",
          message,
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    lifecycle,
    true
  );
  deps.limits.maxReasoningChars = 50;
  const service = createPiGenerationService(deps);

  const events = await drain(
    service.runTurn({ projectId: "p1", prompt: "Build a chart", agentMode: "build", actor })
  );

  assert.match(
    events.find((event) => event.type === "error")?.message ?? "",
    /deliberating without acting/i
  );
  assert.equal(events.some((event) => event.type === "commit"), false);
  assert.equal(lifecycle.includes("restore:base-sha"), true);
});
