import assert from "node:assert/strict";
import test from "node:test";

import { resolvePiAgentLimits } from "../../apps/platform-api/src/generation-loop/pi-limits.ts";

test("Pi gives slow local-model rounds the same default deadline as governed completions", () => {
  const previous = process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
  const previousTurn = process.env.EVCP_PI_TURN_TIMEOUT_MS;
  const previousTokenBudget = process.env.EVCP_PI_MAX_TURN_TOKENS;
  delete process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
  delete process.env.EVCP_PI_TURN_TIMEOUT_MS;
  delete process.env.EVCP_PI_MAX_TURN_TOKENS;

  try {
    const limits = resolvePiAgentLimits();
    assert.equal(limits.maxModelRounds, 20);
    assert.equal(limits.modelRoundTimeoutMs, 300_000);
    assert.equal(limits.turnTimeoutMs, 1_800_000);
    assert.equal(limits.maxTurnTokens, undefined);
  } finally {
    if (previous === undefined) delete process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
    else process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS = previous;
    if (previousTurn === undefined) delete process.env.EVCP_PI_TURN_TIMEOUT_MS;
    else process.env.EVCP_PI_TURN_TIMEOUT_MS = previousTurn;
    if (previousTokenBudget === undefined) delete process.env.EVCP_PI_MAX_TURN_TOKENS;
    else process.env.EVCP_PI_MAX_TURN_TOKENS = previousTokenBudget;
  }
});

test("the cumulative turn-token cap is opt-in for operators", () => {
  const previous = process.env.EVCP_PI_MAX_TURN_TOKENS;
  try {
    process.env.EVCP_PI_MAX_TURN_TOKENS = "600000";
    assert.equal(resolvePiAgentLimits().maxTurnTokens, 600_000);
  } finally {
    if (previous === undefined) delete process.env.EVCP_PI_MAX_TURN_TOKENS;
    else process.env.EVCP_PI_MAX_TURN_TOKENS = previous;
  }
});

test("EVCP_PI_MODEL_ROUND_TIMEOUT_MS lets slow local models raise the per-round deadline", () => {
  const previous = process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;

  try {
    process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS = "900000";
    assert.equal(resolvePiAgentLimits().modelRoundTimeoutMs, 900_000);

    // Still clamped at maximums.modelRoundTimeoutMs — a round can never outlive its turn.
    process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS = "3600000";
    assert.equal(resolvePiAgentLimits().modelRoundTimeoutMs, 1_800_000);
  } finally {
    if (previous === undefined) delete process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
    else process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS = previous;
  }
});

test("a runaway-deliberation round is bounded by a reasoning character budget, not just the round timeout", () => {
  const previous = process.env.EVCP_PI_MAX_REASONING_CHARS;
  delete process.env.EVCP_PI_MAX_REASONING_CHARS;

  try {
    // Local models may need a longer private deliberation before their first tool call;
    // the default still remains far below the hard maximum for a genuinely stuck round.
    assert.equal(resolvePiAgentLimits().maxReasoningChars, 60_000);

    process.env.EVCP_PI_MAX_REASONING_CHARS = "5000";
    assert.equal(resolvePiAgentLimits().maxReasoningChars, 5_000);

    // Clamped at maximums.maxReasoningChars.
    process.env.EVCP_PI_MAX_REASONING_CHARS = "10000000";
    assert.equal(resolvePiAgentLimits().maxReasoningChars, 200_000);
  } finally {
    if (previous === undefined) delete process.env.EVCP_PI_MAX_REASONING_CHARS;
    else process.env.EVCP_PI_MAX_REASONING_CHARS = previous;
  }
});

test("image generation gets its own per-turn call and byte budgets, env-tunable and clamped", () => {
  const previousCalls = process.env.EVCP_PI_MAX_IMAGE_CALLS;
  const previousBytes = process.env.EVCP_PI_IMAGE_MAX_BYTES;
  delete process.env.EVCP_PI_MAX_IMAGE_CALLS;
  delete process.env.EVCP_PI_IMAGE_MAX_BYTES;

  try {
    const limits = resolvePiAgentLimits();
    assert.equal(limits.maxImageCalls, 4);
    assert.equal(limits.maxImageBytes, 4_194_304);

    process.env.EVCP_PI_MAX_IMAGE_CALLS = "6";
    assert.equal(resolvePiAgentLimits().maxImageCalls, 6);
    // clamped at the hard maximum
    process.env.EVCP_PI_MAX_IMAGE_CALLS = "50";
    assert.equal(resolvePiAgentLimits().maxImageCalls, 8);
    process.env.EVCP_PI_IMAGE_MAX_BYTES = "99999999";
    assert.equal(resolvePiAgentLimits().maxImageBytes, 8_388_608);
  } finally {
    if (previousCalls === undefined) delete process.env.EVCP_PI_MAX_IMAGE_CALLS;
    else process.env.EVCP_PI_MAX_IMAGE_CALLS = previousCalls;
    if (previousBytes === undefined) delete process.env.EVCP_PI_IMAGE_MAX_BYTES;
    else process.env.EVCP_PI_IMAGE_MAX_BYTES = previousBytes;
  }
});
