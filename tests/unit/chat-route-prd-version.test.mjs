import test from "node:test";
import assert from "node:assert/strict";
import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";

function fakeRes() {
  const chunks = [];
  return {
    chunks,
    headersSent: false,
    once() {},
    off() {},
    writeHead() {
      this.headersSent = true;
    },
    flushHeaders() {},
    write(s) {
      chunks.push(s);
    },
    end() {}
  };
}
const runTurnOnce = async function* () {
  yield { type: "done" };
};

function deps(captured, record = true) {
  return {
    generationService: { runTurn: () => runTurnOnce(), history: async () => [] },
    resolveAuth: async () => ({
      userId: "u1",
      roles: ["creator"],
      projectIds: ["p1"],
      actor: { id: "u1" }
    }),
    recordPrdVersionFromPlan: record
      ? async (actor, projectId, planText) => {
          captured.call = { actor, projectId, planText };
          return { id: "v2", version: "1.1", changeSummary: "x" };
        }
      : undefined
  };
}

test("records a PRD version and emits prd_version on a build turn with an approved plan", async () => {
  const captured = {};
  const handler = createChatSseHandler(deps(captured));
  const req = {
    url: "/projects/p1/chat",
    method: "POST",
    headers: {},
    body: { prompt: "go", agentMode: "build", approvedPlan: "Step 1: add reports" },
    once() {},
    off() {}
  };
  const res = fakeRes();
  await handler(req, res);
  assert.deepEqual(captured.call, {
    actor: { id: "u1" },
    projectId: "p1",
    planText: "Step 1: add reports"
  });
  assert.ok(res.chunks.some((c) => c.includes("event: prd_version")));
});

test("does not record when there is no approved plan", async () => {
  const captured = {};
  const handler = createChatSseHandler(deps(captured));
  const req = {
    url: "/projects/p1/chat",
    method: "POST",
    headers: {},
    body: { prompt: "go", agentMode: "build" },
    once() {},
    off() {}
  };
  await handler(req, fakeRes());
  assert.equal(captured.call, undefined);
});
