import test from "node:test";
import assert from "node:assert/strict";
import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { buildPublishServiceDeps as buildDeps } from "./publish-service-test-helpers.mjs";

test("republishing the same commit produces a unique immutable image tag per deployment", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const input = {
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  };

  const first = await service.publish(input);
  const second = await service.publish(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.deployment.imageTag, second.deployment.imageTag);
  assert.match(first.deployment.imageTag, /^evcp-production-app:sha1-[a-f0-9]{8}$/);
  assert.match(second.deployment.imageTag, /^evcp-production-app:sha1-[a-f0-9]{8}$/);
});

test("deactivating a healthy revision restores the previous healthy route and removes only the new container", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const first = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });
  deps.git.state.projects.p1.head = "sha2";
  const second = await service.publish({
    projectId: "p1",
    slug: "app",
    environment: "production",
    publishedByUserId: "u1"
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);

  await service.deactivate(second.deployment);

  assert.equal(deps.deployments.getCurrent("app", "production").id, first.deployment.id);
  assert.equal(
    deps.docker.state.containers.some((item) => item.containerId === second.deployment.containerId),
    false
  );
  assert.ok(
    deps.docker.state.containers.some((item) => item.containerId === first.deployment.containerId)
  );
});

test("rolling back app A leaves app B current route and container state unchanged", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p2 = { clean: true, head: "b-sha1", migrationNames: {} };
  const service = createPublishService(deps);
  await service.publish({
    projectId: "p1",
    slug: "app-a",
    environment: "production",
    publishedByUserId: "u1"
  });
  const appB = await service.publish({
    projectId: "p2",
    slug: "app-b",
    environment: "production",
    publishedByUserId: "u2"
  });
  assert.equal(appB.ok, true);
  const appBContainerBefore = deps.docker.state.containers.find(
    (item) => item.containerId === appB.deployment.containerId
  );

  const rollback = await service.publish({
    projectId: "p1",
    slug: "app-a",
    environment: "production",
    commitSha: "sha0",
    publishedByUserId: "u1"
  });

  assert.equal(rollback.ok, true);
  assert.equal(deps.deployments.getCurrent("app-b", "production").id, appB.deployment.id);
  assert.equal(
    deps.docker.state.containers.find((item) => item.containerId === appB.deployment.containerId),
    appBContainerBefore
  );
  assert.equal(appBContainerBefore.status, "running");
});
