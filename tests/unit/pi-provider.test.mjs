import assert from "node:assert/strict";
import test from "node:test";

import { createHorizonPiRuntime } from "../../apps/platform-api/src/generation-loop/pi-provider.ts";

const actor = {
  id: "usr_creator",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};

const context = {
  systemPrompt: "Use only governed Horizon tools.",
  messages: [{ role: "user", content: "Read the current page", timestamp: 1 }],
  tools: [
    {
      name: "read_workspace_file",
      description: "Read a workspace file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false
      }
    }
  ]
};

test("Pi model rounds run through Horizon governance with unique evidence IDs", async () => {
  const rounds = [];
  const controller = new AbortController();
  const executor = {
    async executeAgentRound(receivedActor, input, onEvent) {
      rounds.push({ receivedActor, ...input });
      onEvent({ type: "text_delta", delta: "Done" });
      return {
        status: "succeeded",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
          timestamp: 2
        },
        usage: { input: 8, output: 2, totalTokens: 10, costUsd: 0.001 },
        evidence: { requestId: input.requestId }
      };
    }
  };
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor,
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-1",
    maxModelRounds: 4
  });
  const received = [];

  for (let index = 0; index < 2; index += 1) {
    const stream = modelRuntime.streamSimple(model, context, { signal: controller.signal });
    for await (const event of stream) received.push(event.type);
  }

  assert.equal(rounds.length, 2);
  assert.notEqual(rounds[0].requestId, rounds[1].requestId);
  assert.match(rounds[0].requestId, /^pi_turn-1_1_/);
  assert.equal(rounds[0].receivedActor, actor);
  assert.equal(rounds[0].projectId, "p1");
  assert.equal(rounds[0].systemPrompt, context.systemPrompt);
  assert.deepEqual(
    rounds[0].tools.map((tool) => tool.name),
    ["read_workspace_file"]
  );
  assert.equal(rounds[0].signal, controller.signal);
  assert.deepEqual(received, [
    "start",
    "text_start",
    "text_delta",
    "text_end",
    "done",
    "start",
    "text_start",
    "text_delta",
    "text_end",
    "done"
  ]);
  assert.equal(model.provider, "horizon-governed");
  assert.equal(JSON.stringify(model).includes("primary-secret"), false);
});

test("Pi bridge stops before governance when the model-round limit is exceeded", async () => {
  let calls = 0;
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor: {
      async executeAgentRound(_actor, input) {
        calls += 1;
        return {
          status: "succeeded",
          message: { role: "assistant", content: [{ type: "text", text: "ok" }], timestamp: 2 },
          usage: { input: 1, output: 1, totalTokens: 2, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-limited",
    maxModelRounds: 1
  });

  for await (const _event of modelRuntime.streamSimple(model, context)) {
    // drain first successful round
  }
  const terminal = [];
  for await (const event of modelRuntime.streamSimple(model, context)) terminal.push(event);

  assert.equal(calls, 1);
  assert.deepEqual(
    terminal.map((event) => event.type),
    ["start", "error"]
  );
  assert.equal(terminal.at(-1).reason, "error");
  assert.match(terminal.at(-1).error.errorMessage, /model round limit/i);
});
