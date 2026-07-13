import assert from "node:assert/strict";
import test from "node:test";

const { handlePersistedWorkspacePrompt } = await import(
  "../../apps/platform-api/src/ai-governance/persisted-workspace-prompt-route.ts"
);

test("persisted Creator workspace prompt records executor evidence and never creates a preview when execution is blocked", async () => {
  let submitCalls = 0;
  const result = await handlePersistedWorkspacePrompt({
    actor: { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" },
    project: { id: "project-1", name: "Leave", slug: "leave", ownerUserId: "creator-1", appId: "app-1", status: "active", createdAt: "2026-07-13T00:00:00.000Z" },
    baseline: { id: "prd-1", projectId: "project-1", version: "v1", status: "baseline", isBaseline: true, sourcePrompt: "", changeSummary: "baseline", createdAt: "2026-07-13T00:00:00.000Z", sections: [] },
    prompt: "blocked request",
    requestId: "workspace-request-1",
    executor: { execute: async () => ({ status: "blocked", evidence: { id: "e1", requestId: "workspace-request-1", actorId: "creator-1", projectId: "project-1", scenario: "frontend_coding", providerId: "provider-1", model: "gpt-test", status: "blocked", tokensUsed: 0, latencyMs: 0, fallbackUsed: false, failureReason: "guardrail_blocked", occurredAt: "2026-07-13T00:00:00.000Z" } }) },
    workspace: {
      submitPrompt: async () => { submitCalls += 1; throw new Error("must not submit"); },
      blockPrompt: async () => ({ guardrail: { decision: "block", severity: "high", eventId: "e1" }, task: { id: "task-1" }, preview: { id: "preview-1", version: "preview-0001" }, tokenBudget: { remainingToday: 1000, remainingMonth: 5000, requestEstimate: 0 } })
    },
    audit: async () => undefined
  });
  assert.equal(submitCalls, 0);
  assert.equal(result.status, 200);
  assert.equal(result.body.aiEvidence.providerId, "provider-1");
  assert.equal(result.body.aiEvidence.failureReason, "guardrail_blocked");
});

test("persisted Creator workspace prompt uses the governed provider evidence for a successful workspace mutation", async () => {
  const result = await handlePersistedWorkspacePrompt({
    actor: { id: "creator-1", email: "creator@example.test", name: "Creator", role: "creator" },
    project: { id: "project-1", name: "Leave", slug: "leave", ownerUserId: "creator-1", appId: "app-1", status: "active", createdAt: "2026-07-13T00:00:00.000Z" },
    baseline: { id: "prd-1", projectId: "project-1", version: "v1", status: "baseline", isBaseline: true, sourcePrompt: "", changeSummary: "baseline", createdAt: "2026-07-13T00:00:00.000Z", sections: [] },
    prompt: "Add a leave dashboard",
    requestId: "workspace-request-2",
    executor: { execute: async () => ({ status: "fallback", text: "safe completion", evidence: { id: "e2", requestId: "workspace-request-2", actorId: "creator-1", projectId: "project-1", scenario: "frontend_coding", providerId: "provider-2", model: "gpt-fallback", status: "fallback", tokensUsed: 42, latencyMs: 7, fallbackUsed: true, occurredAt: "2026-07-13T00:00:00.000Z" } }) },
    workspace: {
      blockPrompt: async () => { throw new Error("must not block"); },
      submitPrompt: async (_actor, input) => ({ guardrail: input.guardrail, task: { id: "task-2" }, preview: { id: "preview-2", version: "preview-0002" }, usage: { id: "usage-2", tokensUsed: input.tokensUsed }, tokenBudget: { remainingToday: 958, remainingMonth: 4958, requestEstimate: 42 } })
    },
    audit: async () => undefined
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.aiEvidence.providerId, "provider-2");
  assert.equal(result.body.aiEvidence.tokensUsed, 42);
});
