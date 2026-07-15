import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { rehydrateRunningDeployment } from "../../apps/platform-api/src/publish/deployment-rehydration.ts";

const healthy = { check: async () => true };

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
    health: healthy,
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
    health: healthy,
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
      health: healthy,
      docker: {
        inspectContainer: async () => ({ containerId: "container-123", image: "image:tag", env: [], ...inspected })
      },
      slug: "app",
      environment: "staging"
    });
    assert.equal(restored, null);
  }
});

test("restart re-probes the persisted current revision and removes it from routing when not ready", async () => {
  const deployments = createMemoryDeploymentStore();
  const deployment = deployments.create({
    projectId: "p1",
    slug: "app",
    environment: "production",
    commitSha: "sha1",
    imageTag: "app:sha1",
    imageDigest: "image1",
    containerId: "c1",
    containerName: "app-sha1",
    publishedByUserId: "u1"
  });
  deployments.updateHealth(deployment.id, "healthy");

  const restored = await rehydrateRunningDeployment({
    deployments,
    docker: {
      inspectContainer: async () => ({
        containerId: "c1",
        running: true,
        image: "app:sha1",
        env: [],
        labels: { "evcp.managed": "true", "evcp.project-slug": "app", "evcp.env": "production" }
      })
    },
    health: { check: async () => false },
    slug: "app",
    environment: "production"
  });

  assert.equal(restored, null);
  assert.equal(deployments.getCurrent("app", "production"), null);
});
