import assert from "node:assert/strict";
import test from "node:test";

const { GovernedAiExecutor, MemoryAiExecutionStore } =
  await import("../../apps/platform-api/src/ai-governance/execution-service.ts");

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const actor = {
  id: "usr_creator",
  email: "creator@example.test",
  name: "Creator",
  role: "creator"
};
const imagePlan = {
  provider: {
    id: "aip_google_image",
    model: "gemini-2.5-flash-image",
    secret: "gk",
    adapter: "google"
  }
};

function imageExecutor(overrides = {}) {
  const store = new MemoryAiExecutionStore();
  const calls = { invoke: 0, scenarios: [] };
  const executor = new GovernedAiExecutor({
    store,
    resolvePlan: async (_actor, scenario) => {
      calls.scenarios.push(scenario);
      return overrides.plan ?? imagePlan;
    },
    evaluateGuardrail: overrides.evaluateGuardrail ?? (async () => ({ decision: "allow" })),
    reserveQuota: async () => {
      calls.quotaReservations = (calls.quotaReservations ?? 0) + 1;
      return { allowed: false, remainingToday: 0, quotaScope: "organization" };
    },
    reconcileQuota: async () => {
      calls.quotaReconciliations = (calls.quotaReconciliations ?? 0) + 1;
    },
    invoke: async () => {
      throw new Error("text invoke must not be called for images");
    },
    invokeImage:
      overrides.invokeImage ??
      (async () => {
        calls.invoke += 1;
        return {
          base64: PNG_B64,
          mimeType: "image/png",
          tokensUsed: 1290,
          latencyMs: 1200,
          costUsd: 0,
          providerId: "aip_google_image",
          model: "gemini-2.5-flash-image"
        };
      })
  });
  return { executor, store, calls };
}

test("generateImage runs the governed pipeline under image_generation and returns bytes", async () => {
  const { executor, store, calls } = imageExecutor();
  const result = await executor.generateImage(actor, {
    projectId: "proj_1",
    prompt: "hero image of a tractor",
    requestId: "img_1"
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.base64, PNG_B64);
  assert.equal(result.mimeType, "image/png");
  assert.deepEqual(calls.scenarios, ["image_generation"]);
  assert.equal(result.evidence.scenario, "image_generation");
  assert.equal(calls.quotaReservations ?? 0, 0, "image generation must not consume token quota");
  assert.equal(
    calls.quotaReconciliations ?? 0,
    0,
    "image generation must not reconcile token quota"
  );
  // base64 must NOT be persisted — only a short marker
  const persisted = await store.findByRequestId("img_1");
  assert.equal("base64" in persisted, false);
  assert.match(persisted.text ?? "", /^image:image\/png:\d+b$/);
});

test("generateImage reports a replay without persisted bytes as unavailable, never as success", async () => {
  const { executor, calls } = imageExecutor();
  await executor.generateImage(actor, { projectId: "p", prompt: "x", requestId: "img_2" });
  const replay = await executor.generateImage(actor, {
    projectId: "p",
    prompt: "x",
    requestId: "img_2"
  });
  assert.equal(calls.invoke, 1);
  assert.equal(replay.status, "failed");
  assert.equal(replay.base64, undefined);
  assert.match(replay.evidence.failureReason ?? "", /replay|unavailable/i);
});

test("guardrail block short-circuits without invoking the provider", async () => {
  const blocked = imageExecutor({
    evaluateGuardrail: async () => ({ decision: "block", reason: "nsfw" })
  });
  const blockedResult = await blocked.executor.generateImage(actor, {
    projectId: "p",
    prompt: "x",
    requestId: "img_3"
  });
  assert.equal(blockedResult.status, "blocked");
  assert.equal(blockedResult.evidence.failureReason, "nsfw");
  assert.equal(blocked.calls.invoke, 0);
});

test("provider failure falls back when configured and reports failed when not", async () => {
  const withFallback = imageExecutor({
    plan: {
      provider: { id: "aip_a", model: "m", secret: "s", adapter: "google" },
      fallback: { id: "aip_b", model: "m2", secret: "s2", adapter: "openai" }
    },
    invokeImage: (() => {
      let n = 0;
      return async ({ provider }) => {
        n += 1;
        if (n === 1) throw new Error("google 500");
        return {
          base64: PNG_B64,
          mimeType: "image/png",
          tokensUsed: 1,
          latencyMs: 5,
          costUsd: 0,
          providerId: provider.id,
          model: provider.model
        };
      };
    })()
  });
  const fallback = await withFallback.executor.generateImage(actor, {
    projectId: "p",
    prompt: "x",
    requestId: "img_5"
  });
  assert.equal(fallback.status, "fallback");
  assert.equal(fallback.base64, PNG_B64);
  assert.equal(fallback.evidence.providerId, "aip_b");

  const failing = imageExecutor({
    invokeImage: async () => {
      throw new Error("provider down");
    }
  });
  const failed = await failing.executor.generateImage(actor, {
    projectId: "p",
    prompt: "x",
    requestId: "img_6"
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.base64, undefined);
  assert.match(failed.evidence.failureReason ?? "", /provider down/);
});
