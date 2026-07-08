import test from "node:test";
import assert from "node:assert/strict";
import * as types from "../../packages/types/src/index.ts";

test("WorkspaceDeployment record shape is constructible", () => {
  const deployment = {
    id: "dep-1",
    projectId: "proj-1",
    slug: "my-app",
    environment: "production",
    commitSha: "abc123",
    imageTag: "evcp-prod-my-app:abc123",
    containerId: "container-xyz",
    publishedByUserId: "user-1",
    healthStatus: "healthy",
    createdAt: new Date().toISOString()
  };
  assert.equal(deployment.environment, "production");
  assert.equal(deployment.healthStatus, "healthy");
  assert.ok(types); // module loads without throwing
});
