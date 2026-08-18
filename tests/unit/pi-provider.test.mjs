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

test("Pi bridge streams final text when the governed provider emitted no deltas", async () => {
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor: {
      async executeAgentRound(_actor, input) {
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Final-only answer" }],
            timestamp: 2
          },
          usage: { input: 2, output: 3, totalTokens: 5, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-final-only",
    maxModelRounds: 1
  });
  const events = [];

  for await (const event of modelRuntime.streamSimple(model, context)) events.push(event);

  assert.deepEqual(
    events.map((event) => event.type),
    ["start", "text_start", "text_delta", "text_end", "done"]
  );
  assert.equal(events.find((event) => event.type === "text_delta").delta, "Final-only answer");
});

test("Pi bridge streams final reasoning when the governed provider emitted no deltas", async () => {
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor: {
      async executeAgentRound(_actor, input) {
        return {
          status: "succeeded",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "Final-only reasoning" },
              { type: "text", text: "Answer" }
            ],
            timestamp: 2
          },
          usage: { input: 2, output: 4, totalTokens: 6, costUsd: 0 },
          evidence: { requestId: input.requestId }
        };
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-final-reasoning",
    maxModelRounds: 1
  });
  const events = [];

  for await (const event of modelRuntime.streamSimple(model, context)) events.push(event);

  assert.equal(
    events.find((event) => event.type === "thinking_delta")?.delta,
    "Final-only reasoning"
  );
});

test("Pi bridge exposes governed provider fallback as streamed reasoning", async () => {
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor: {
      async executeAgentRound(_actor, input) {
        return {
          status: "fallback",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Fallback answer" }],
            timestamp: 2
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: {
            requestId: input.requestId,
            failureReason: "AI provider returned HTTP 402"
          }
        };
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-fallback",
    maxModelRounds: 1
  });
  const events = [];

  for await (const event of modelRuntime.streamSimple(model, context)) events.push(event);

  assert.equal(
    events.find((event) => event.type === "thinking_delta")?.delta,
    "Using fallback AI provider: AI provider returned HTTP 402"
  );
  assert.equal(events.at(-1).type, "done");
});

test("Pi bridge reports provider degradation once per turn instead of once per model round", async () => {
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor: {
      async executeAgentRound(_actor, input) {
        return {
          status: "fallback",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Fallback answer" }],
            timestamp: 2
          },
          usage: { input: 2, output: 2, totalTokens: 4, costUsd: 0 },
          evidence: { requestId: input.requestId, failureReason: "primary unavailable" }
        };
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-fallback-once",
    maxModelRounds: 2
  });
  const events = [];

  for (let index = 0; index < 2; index += 1) {
    for await (const event of modelRuntime.streamSimple(model, context)) events.push(event);
  }

  assert.deepEqual(
    events
      .filter((event) => event.type === "thinking_delta")
      .map((event) => event.delta),
    ["Using fallback AI provider: primary unavailable"]
  );
});

test("Pi bridge aborts a governed model round that exceeds its own deadline", async () => {
  let receivedSignal;
  const { modelRuntime, model } = await createHorizonPiRuntime({
    executor: {
      async executeAgentRound(_actor, input) {
        receivedSignal = input.signal;
        if (!input.signal) {
          return {
            status: "failed",
            evidence: { requestId: input.requestId, failureReason: "missing timeout signal" }
          };
        }
        await new Promise((resolve) => input.signal.addEventListener("abort", resolve, { once: true }));
        return {
          status: "failed",
          evidence: { requestId: input.requestId, failureReason: "aborted" }
        };
      }
    },
    actor,
    projectId: "p1",
    scenario: "frontend_coding",
    turnId: "turn-round-timeout",
    maxModelRounds: 1,
    modelRoundTimeoutMs: 20
  });
  const events = [];

  for await (const event of modelRuntime.streamSimple(model, context)) events.push(event);

  assert.equal(receivedSignal?.aborted, true);
  assert.equal(events.at(-1).type, "error");
  assert.match(events.at(-1).error.errorMessage, /model round timed out/i);
});
