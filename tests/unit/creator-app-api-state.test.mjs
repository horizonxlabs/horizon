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

const firstProject = { id: "project-1", name: "First Project" };
const secondProject = { id: "project-2", name: "Second Project" };

test("Creator project selection defaults only when no project ID was requested", () => {
  assert.equal(typeof selectCreatorProjectForRequest, "function");
  assert.equal(
    selectCreatorProjectForRequest?.([firstProject, secondProject], undefined)?.id,
    "project-1"
  );
});

test("Creator project selection does not substitute another project for an unknown requested ID", () => {
  assert.equal(
    selectCreatorProjectForRequest?.([firstProject, secondProject], "missing-project")?.id,
    ""
  );
});
