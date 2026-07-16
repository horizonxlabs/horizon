import test from "node:test";
import assert from "node:assert/strict";

const { streamGovernedExecution } = await import(
  "../../apps/platform-api/src/generation-loop/governed-completion.ts"
);

const actor = { id: "u", email: "e@test", name: "n", role: "creator" };
const input = { actor, projectId: "p", scenario: "frontend_coding", prompt: "hi", requestId: "r" };

async function collect(iterable) {
  const out = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

test("streams answer tokens as tagged chunks as the executor emits them", async () => {
  const executor = {
    async execute(_actor, _input, onToken) {
      onToken?.("Hel");
      onToken?.("lo");
      return { text: "Hello", status: "succeeded", evidence: {} };
    }
  };
  const chunks = await collect(streamGovernedExecution(executor, input));
  assert.deepEqual(chunks, [
    { kind: "token", text: "Hel" },
    { kind: "token", text: "lo" }
  ]);
});

test("streams reasoning on a separate channel (never mixed with answer tokens)", async () => {
  const executor = {
    async execute(_actor, _input, onToken, onReasoning) {
      onReasoning?.("thinking...");
      onToken?.("answer");
      return { text: "answer", status: "succeeded", evidence: {} };
    }
  };
  const chunks = await collect(streamGovernedExecution(executor, input));
  assert.deepEqual(chunks, [
    { kind: "reasoning", text: "thinking..." },
    { kind: "token", text: "answer" }
  ]);
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
  const chunks = await collect(streamGovernedExecution(executor, input));
  assert.deepEqual(chunks, [{ kind: "token", text: "whole response" }]);
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
