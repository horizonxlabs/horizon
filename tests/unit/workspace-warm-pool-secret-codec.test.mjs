import assert from "node:assert/strict";
import { test } from "node:test";

import { createWarmPoolSecretCodec } from "../../apps/platform-api/src/workspace-orchestrator/warm-pool-secret-codec.ts";

test("credential envelopes round-trip without plaintext", () => {
  const codec = createWarmPoolSecretCodec("1".repeat(64));
  const payload = codec.seal({
    DATABASE_URL: "postgresql://secret",
    LLM_GATEWAY_KEY: "sk-secret"
  });

  assert.doesNotMatch(payload, /postgresql|sk-secret/);
  assert.deepEqual(codec.open(payload), {
    DATABASE_URL: "postgresql://secret",
    LLM_GATEWAY_KEY: "sk-secret"
  });
});

test("credential envelopes reject authenticated payload tampering", () => {
  const codec = createWarmPoolSecretCodec("2".repeat(64));
  const payload = codec.seal({ DATABASE_URL: "postgresql://secret" });
  const parts = payload.split(".");
  parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;

  assert.throws(() => codec.open(parts.join(".")));
});
