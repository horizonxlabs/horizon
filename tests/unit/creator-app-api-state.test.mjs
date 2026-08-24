import assert from "node:assert/strict";
import test from "node:test";

const { creatorApiFailureState, selectCreatorProjectForRequest } =
  await import("../../apps/creator-web/src/app/creator-app-helpers.ts");

test("Creator API failure exposes retryable unavailable state without a project fixture", () => {
  const state = creatorApiFailureState("Platform API unavailable");
  assert.equal(state.status, "error");
  assert.equal(state.projects.length, 0);
  assert.equal(state.selectedProject.id, "");
  assert.equal(state.message, "Platform API unavailable");
});

const firstProject = {
  id: "project-1",
  name: "First Project",
  createdAt: "2026-08-01T00:00:00.000Z"
};
const secondProject = {
  id: "project-2",
  name: "Second Project",
  createdAt: "2026-08-20T00:00:00.000Z"
};

test("Creator project selection defaults to the most recently created project", () => {
  assert.equal(typeof selectCreatorProjectForRequest, "function");
  assert.equal(
    selectCreatorProjectForRequest?.([firstProject, secondProject], undefined)?.id,
    "project-2"
  );
});

test("Creator project selection does not substitute another project for an unknown requested ID", () => {
  assert.equal(
    selectCreatorProjectForRequest?.([firstProject, secondProject], "missing-project")?.id,
    ""
  );
});
