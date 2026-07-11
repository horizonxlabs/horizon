import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { rehydrateRunningDeployment } from "../../apps/platform-api/src/publish/deployment-rehydration.ts";

test("rehydrates a missing staging deployment only from its running, managed id-derived container", async () => {
  const deployments = createMemoryDeploymentStore();
  const inspectedNames = [];
  const docker = {
    inspectContainer: async (name) => {
      inspectedNames.push(name);
      return {
        containerId: "container-123",
        running: true,
        image: "evcp-app-prj-e8204c2a1b7e4901a1db54c2317b4852:abc123",
        labels: {
          "evcp.managed": "true",
          "evcp.project-id": "prj_e8204c2a1b7e4901a1db54c2317b4852",
          "evcp.project-slug": "prj-e8204c2a1b7e4901a1db54c2317b4852",
          "evcp.env": "staging"
        },
        env: []
      };
    }
  };

  const restored = await rehydrateRunningDeployment({
    deployments,
    docker,
    slug: "prj-e8204c2a1b7e4901a1db54c2317b4852",
    environment: "staging"
  });

  assert.equal(inspectedNames[0], "evcp-staging-prj-e8204c2a1b7e4901a1db54c2317b4852");
  assert.equal(restored?.healthStatus, "healthy");
  assert.equal(restored?.projectId, "prj_e8204c2a1b7e4901a1db54c2317b4852");
  assert.equal(restored?.containerId, "container-123");
  assert.equal(restored?.imageTag, "evcp-app-prj-e8204c2a1b7e4901a1db54c2317b4852:abc123");
  assert.equal(
    deployments.getCurrent("prj-e8204c2a1b7e4901a1db54c2317b4852", "staging")?.id,
    restored?.id
  );
});

test("legacy containers without a project-id label use a non-authoritative recovered marker", async () => {
  const restored = await rehydrateRunningDeployment({
    deployments: createMemoryDeploymentStore(),
    docker: {
      inspectContainer: async () => ({
        containerId: "container-123",
        running: true,
        image: "image:tag",
        labels: { "evcp.managed": "true", "evcp.project-slug": "app", "evcp.env": "staging" },
        env: []
      })
    },
    slug: "app",
    environment: "staging"
  });
  assert.equal(restored?.projectId, "recovered:app");
});

test("does not restore a stopped, unmanaged, or mismatched deployment container", async () => {
  const deployments = createMemoryDeploymentStore();
  for (const inspected of [
    { running: false, labels: { "evcp.managed": "true", "evcp.project-slug": "app", "evcp.env": "staging" } },
    { running: true, labels: { "evcp.managed": "false", "evcp.project-slug": "app", "evcp.env": "staging" } },
    { running: true, labels: { "evcp.managed": "true", "evcp.project-slug": "other", "evcp.env": "staging" } }
  ]) {
    const restored = await rehydrateRunningDeployment({
      deployments,
      docker: {
        inspectContainer: async () => ({ containerId: "container-123", image: "image:tag", env: [], ...inspected })
      },
      slug: "app",
      environment: "staging"
    });
    assert.equal(restored, null);
  }
});
