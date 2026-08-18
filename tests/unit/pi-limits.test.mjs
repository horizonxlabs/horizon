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
    assert.equal(limits.maxTurnTokens, 160_000);
  } finally {
    if (previous === undefined) delete process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS;
    else process.env.EVCP_PI_MODEL_ROUND_TIMEOUT_MS = previous;
  }
});
