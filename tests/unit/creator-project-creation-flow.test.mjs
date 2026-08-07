import assert from "node:assert/strict";
import test from "node:test";

const { createProjectWithInitialPrd } = await import(
  "../../apps/creator-web/src/app/creator-app-helpers.ts"
);

const input = {
  name: "Todolist",
  appType: "Workflow App",
  businessProblem: "Track tasks",
  targetDepartment: "Operations",
  intendedUsers: ["Internal teams"],
  dataSensitivity: "internal"
};
const project = { id: "prj_todo", name: "Todolist" };
const draft = { id: "prd_todo", projectId: "prj_todo", version: "0.1", status: "draft" };

test("project creation returns partial success when initial PRD generation fails", async () => {
  const calls = [];
  const client = {
    async createProject(received) {
      calls.push(["project", received]);
      return project;
    },
    async generatePrdDraft(projectId) {
      calls.push(["prd", projectId]);
      throw new Error("provider unavailable");
    }
  };

  const result = await createProjectWithInitialPrd(client, input);

  assert.equal(result.project, project);
  assert.equal(result.draft, undefined);
  assert.match(result.prdError?.message ?? "", /provider unavailable/);
  assert.deepEqual(calls, [["project", input], ["prd", "prj_todo"]]);
});

test("project creation returns the generated PRD when both calls succeed", async () => {
  const client = {
    async createProject() { return project; },
    async generatePrdDraft() { return draft; }
  };

  const result = await createProjectWithInitialPrd(client, input);

  assert.equal(result.project, project);
  assert.equal(result.draft, draft);
  assert.equal(result.prdError, undefined);
});
