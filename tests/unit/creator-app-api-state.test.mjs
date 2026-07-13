import assert from "node:assert/strict";
import test from "node:test";

const { creatorApiFailureState } = await import("../../apps/creator-web/src/app/creator-app-helpers.ts");

test("Creator API failure exposes retryable unavailable state without a project fixture", () => {
  const state = creatorApiFailureState("Platform API unavailable");
  assert.equal(state.status, "error");
  assert.equal(state.projects.length, 0);
  assert.equal(state.selectedProject.id, "");
  assert.equal(state.message, "Platform API unavailable");
});

