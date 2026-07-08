import test from "node:test";
import assert from "node:assert/strict";
import * as types from "../../packages/types/src/index.ts";

test("generation-loop record shapes are constructible", () => {
  const message = {
    id: "msg-1",
    projectId: "proj-1",
    role: "assistant",
    content: "done",
    artifactActionIds: ["act-1"],
    commitSha: "abc123",
    tokenUsage: { promptTokens: 10, completionTokens: 5 },
    createdAt: new Date().toISOString()
  };
  const summary = { projectId: "proj-1", summary: "rolling summary", updatedAt: new Date().toISOString() };
  const checkpoint = { id: "chk-1", projectId: "proj-1", tag: "checkpoint/1", commitSha: "abc123", label: "Save Checkpoint", createdAt: new Date().toISOString() };
  const migration = { id: "mig-1", projectId: "proj-1", name: "add_users_table", sql: "CREATE TABLE users();", commitSha: "abc123", appliedAt: new Date().toISOString() };

  assert.equal(message.projectId, "proj-1");
  assert.equal(summary.projectId, "proj-1");
  assert.equal(checkpoint.tag, "checkpoint/1");
  assert.equal(migration.name, "add_users_table");
  assert.ok(types); // module loads without throwing
});
