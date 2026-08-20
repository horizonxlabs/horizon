import assert from "node:assert/strict";
import test from "node:test";

import { resolvePiAgentLimits } from "../../apps/platform-api/src/generation-loop/pi-limits.ts";

test("Pi gives slow local-model rounds the same default deadline as governed completions", () => {
  const previous = process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
  delete process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;

  try {
    const limits = resolvePiAgentLimits();
    assert.equal(limits.maxModelRounds, 12);
    assert.equal(limits.modelRoundTimeoutMs, 300_000);
    assert.equal(limits.maxTurnTokens, 600_000);
  } finally {
    if (previous === undefined) delete process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
    else process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS = previous;
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
