import test from "node:test";
import assert from "node:assert/strict";

const { initialFrontendVersionsState, loadFrontendVersions, restoreFrontendVersion } =
  await import("../../apps/creator-web/src/features/versions/use-frontend-versions.ts");
const { initialDeploymentsState, loadDeployments } =
  await import("../../apps/creator-web/src/features/deployments/use-deployments.ts");

const project = {
  id: "proj_1",
  name: "Leave Management",
  status: "active",
  ownerUserId: "user_1",
  appType: "Workflow App",
  businessProblem: "Manage leave",
  targetDepartment: "People",
  intendedUsers: ["employee"],
  dataSensitivity: "internal",
  createdAt: "2026-07-29T00:00:00.000Z"
};

const currentCheckpoint = {
  id: "checkpoint_2",
  projectId: "proj_1",
  version: "fe-0002",
  sourcePreviewVersion: "preview-2",
  status: "current",
  checksum: "sha256:current",
  fileManifest: ["src/App.tsx"],
  routeSnapshot: ["/"],
  changeSummary: "Current version",
  changedAreas: ["UI"],
  createdByUserId: "user_1",
  createdAt: "2026-07-29T02:00:00.000Z"
};

const previousCheckpoint = {
  ...currentCheckpoint,
  id: "checkpoint_1",
  version: "fe-0001",
  status: "previous",
  checksum: "sha256:previous",
  changeSummary: "Initial version",
  createdAt: "2026-07-29T01:00:00.000Z"
};

const timeline = {
  project,
  activeCheckpoint: currentCheckpoint,
  checkpoints: [currentCheckpoint, previousCheckpoint]
};

const restoreResult = {
  checkpoint: currentCheckpoint,
  restoredFrom: previousCheckpoint,
  boundary: {
    frontendChanged: true,
    unchanged: ["backend", "database", "auth", "app_roles", "membership", "domain", "prd_baseline"]
  },
  auditEventId: "audit_1"
};

test("frontend versions lifecycle starts loading and refreshes into ready state", async () => {
  assert.deepEqual(initialFrontendVersionsState, {
    status: "loading",
    message: "Loading frontend checkpoints from Platform API."
  });
  const calls = [];
  const state = await loadFrontendVersions("proj_1", {
    async getFrontendCheckpoints(projectId) {
      calls.push(["get", projectId]);
      return timeline;
    }
  });
  assert.deepEqual(calls, [["get", "proj_1"]]);
  assert.equal(state.status, "ready");
  assert.equal(state.timeline, timeline);
  assert.match(state.message, /2 frontend checkpoints loaded/);
});

test("frontend versions refresh fail-closes API failures without stale timeline", async () => {
  const state = await loadFrontendVersions("proj_1", {
    async getFrontendCheckpoints() {
      throw new Error("offline");
    }
  });
  assert.deepEqual(state, {
    status: "error",
    message: "Unable to load frontend checkpoints: offline"
  });
});

test("frontend restore reports mutation failures without refreshing", async () => {
  const calls = [];
  const state = await restoreFrontendVersion("proj_1", "checkpoint_1", {
    async restoreFrontendCheckpoint(projectId, checkpointId) {
      calls.push(["restore", projectId, checkpointId]);
      throw new Error("restore rejected");
    },
    async getFrontendCheckpoints() {
      calls.push(["get"]);
      return timeline;
    }
  });
  assert.deepEqual(calls, [["restore", "proj_1", "checkpoint_1"]]);
  assert.equal(state.status, "error");
  assert.equal(state.message, "Frontend restore failed: restore rejected");
  assert.equal(state.lastRestore, undefined);
});

test("frontend restore refreshes the timeline after a successful mutation", async () => {
  const calls = [];
  const state = await restoreFrontendVersion("proj_1", "checkpoint_1", {
    async restoreFrontendCheckpoint(projectId, checkpointId) {
      calls.push(["restore", projectId, checkpointId]);
      return restoreResult;
    },
    async getFrontendCheckpoints(projectId) {
      calls.push(["get", projectId]);
      return timeline;
    }
  });
  assert.deepEqual(calls, [
    ["restore", "proj_1", "checkpoint_1"],
    ["get", "proj_1"]
  ]);
  assert.equal(state.status, "ready");
  assert.equal(state.timeline, timeline);
  assert.equal(state.lastRestore, restoreResult);
  assert.match(state.message, /Restored frontend from fe-0001/);
});

test("frontend restore preserves mutation success when the timeline refresh fails", async () => {
  let restoreCalls = 0;
  const state = await restoreFrontendVersion("proj_1", "checkpoint_1", {
    async restoreFrontendCheckpoint() {
      restoreCalls += 1;
      return restoreResult;
    },
    async getFrontendCheckpoints() {
      throw new Error("refresh offline");
    }
  });
  assert.equal(restoreCalls, 1);
  assert.equal(state.status, "ready");
  assert.equal(state.lastRestore, restoreResult);
  assert.equal(state.timeline, undefined);
  assert.match(state.message, /Restored frontend from fe-0001/);
  assert.match(state.message, /refresh failed: refresh offline/i);
  assert.doesNotMatch(state.message, /restore failed/i);
});

test("deployments lifecycle starts loading and refreshes into ready and empty states", async () => {
  assert.deepEqual(initialDeploymentsState, {
    status: "loading",
    message: "Loading deployments from Platform API.",
    deployments: []
  });
  const deployment = {
    id: "deployment_1",
    projectId: "proj_1",
    slug: "leave-management",
    environment: "staging",
    commitSha: "abc123",
    imageTag: "leave-management:abc123",
    containerId: "container_1",
    publishedByUserId: "user_1",
    healthStatus: "healthy",
    createdAt: "2026-07-29T03:00:00.000Z"
  };
  const ready = await loadDeployments("proj_1", {
    async listDeployments() {
      return [deployment];
    }
  });
  assert.deepEqual(ready.deployments, [deployment]);
  assert.equal(ready.status, "ready");
  assert.match(ready.message, /1 deployments loaded/);

  const empty = await loadDeployments("proj_1", {
    async listDeployments() {
      return [];
    }
  });
  assert.equal(empty.status, "ready");
  assert.deepEqual(empty.deployments, []);
  assert.match(empty.message, /returned no deployments/);
});

test("deployments refresh fail-closes API failures without stale records", async () => {
  const state = await loadDeployments("proj_1", {
    async listDeployments() {
      throw new Error("offline");
    }
  });
  assert.deepEqual(state, {
    status: "error",
    message: "Unable to load deployments: offline",
    deployments: []
  });
});
