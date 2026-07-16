import test from "node:test";
import assert from "node:assert/strict";

const { streamGovernedExecution } = await import(
  "../../apps/platform-api/src/generation-loop/governed-completion.ts"
);

const actor = { id: "u", email: "e@test", name: "n", role: "creator" };
const input = { actor, projectId: "p", scenario: "frontend_coding", prompt: "hi", requestId: "r" };

async function collect(iterable) {
  const out = [];
  for await (const token of iterable) out.push(token);
  return out;
}

test("streams tokens to the caller as the governed executor emits them", async () => {
  const executor = {
    async execute(_actor, _input, onToken) {
      onToken?.("Hel");
      onToken?.("lo");
      onToken?.(" world");
      return { text: "Hello world", status: "succeeded", evidence: {} };
    }
  };
  const tokens = await collect(streamGovernedExecution(executor, input));
  assert.deepEqual(tokens, ["Hel", "lo", " world"]);
});

test("throws with the failure reason when the governed execution fails", async () => {
  const executor = {
    async execute() {
      return { text: "", status: "failed", evidence: { failureReason: "fetch failed" } };
    }
  };
  await assert.rejects(
    () => collect(streamGovernedExecution(executor, input)),
    /Governed AI completion unavailable: fetch failed/
  );
});

test("emits the full text for a non-streaming provider that never called onToken", async () => {
  const executor = {
    async execute() {
      return { text: "whole response", status: "succeeded", evidence: {} };
    }
  };
  const tokens = await collect(streamGovernedExecution(executor, input));
  assert.deepEqual(tokens, ["whole response"]);
});

test("forwards the execution evidence to onEvidence", async () => {
  let seen;
  const executor = {
    async execute(_actor, _input, onToken) {
      onToken?.("x");
      return { text: "x", status: "succeeded", evidence: { id: "ev1" } };
    }
  };
  await collect(streamGovernedExecution(executor, input, (evidence) => {
    seen = evidence;
  }));
  assert.equal(seen.id, "ev1");
});
