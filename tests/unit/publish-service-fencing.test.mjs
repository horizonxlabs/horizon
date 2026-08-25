import assert from "node:assert/strict";
import test from "node:test";

import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import {
  createMemoryProjectLifecycleStore,
  createProjectLifecycleCoordinator
} from "../../apps/platform-api/src/project-lifecycle.ts";
import { buildPublishServiceDeps } from "./publish-service-test-helpers.mjs";
import { buildFencedImage } from "../../apps/platform-api/src/publish/fenced-image-build.ts";
import { withFencedCheckout } from "../../apps/platform-api/src/publish/fenced-checkout.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a publish that loses its fence during Docker create removes the candidate and cannot start or persist", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const publisher = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const deleter = createProjectLifecycleCoordinator({ store, deletionLeaseMs: 100 });
  const deps = buildPublishServiceDeps();
  deps.lifecycle = publisher;
  const originalCreate = deps.docker.createContainer.bind(deps.docker);
  const createStarted = deferred();
  const resumeCreate = deferred();
  const started = [];
  const originalStart = deps.docker.startContainer.bind(deps.docker);
  deps.docker.createContainer = async (spec) => {
    const created = await originalCreate(spec);
    createStarted.resolve();
    await resumeCreate.promise;
    return created;
  };
  deps.docker.startContainer = async (id) => { started.push(id); return originalStart(id); };

  const publish = createPublishService(deps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await createStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await deleter.runDeletion("p1", async () => undefined);
  resumeCreate.resolve();

  await assert.rejects(publish, /being deleted/);
  assert.deepEqual(started, []);
  assert.deepEqual(deps.deployments.list("p1"), []);
  assert.equal(
    deps.docker.state.containers.some((item) => item.spec.name?.startsWith("evcp-production-app-")),
    false
  );
});

test("a publish that loses ownership during deployment flush compensates the persisted candidate", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const deps = buildPublishServiceDeps();
  deps.lifecycle = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const flushStarted = deferred();
  const resumeFlush = deferred();
  let flushes = 0;
  deps.deployments.flush = async () => {
    flushes += 1;
    if (flushes === 1) { flushStarted.resolve(); await resumeFlush.promise; }
  };

  const publish = createPublishService(deps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await flushStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("p1", async () => undefined);
  resumeFlush.resolve();

  await assert.rejects(publish, /being deleted/);
  assert.deepEqual(deps.deployments.list("p1"), []);
  assert.equal(flushes, 2, "the lost owner durably compensates its flushed candidate");
  assert.equal(
    deps.docker.state.containers.some((item) => item.spec.name?.startsWith("evcp-production-app-")),
    false
  );
});

test("a publish that loses ownership inside image build removes the image and never creates a container", async () => {
  let databaseTime = new Date("2026-08-25T00:00:00.000Z");
  const store = createMemoryProjectLifecycleStore({ now: () => databaseTime });
  const deps = buildPublishServiceDeps();
  deps.lifecycle = createProjectLifecycleCoordinator({ store, mutationLeaseMs: 100 });
  const buildStarted = deferred();
  const resumeBuild = deferred();
  const removedImages = [];
  const originalBuild = deps.docker.buildImage.bind(deps.docker);
  deps.docker.buildImage = async (...args) => {
    const result = await originalBuild(...args);
    buildStarted.resolve();
    await resumeBuild.promise;
    return result;
  };
  deps.docker.removeImage = async (image) => { removedImages.push(image); };

  const publish = createPublishService(deps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await buildStarted.promise;
  databaseTime = new Date("2026-08-25T00:00:00.200Z");
  await createProjectLifecycleCoordinator({ store }).runDeletion("p1", async () => undefined);
  resumeBuild.resolve();

  await assert.rejects(publish, /being deleted/);
  assert.deepEqual(removedImages, ["mem-build-1"]);
  assert.equal(deps.docker.state.containers.length, 1, "only the development container remains");
});

test("image-build compensation surfaces both the lost fence and image-removal failure", async () => {
  let assertions = 0;
  const lostFence = new Error("publish fence expired");
  const removalFailure = new Error("image removal unavailable");
  await assert.rejects(
    buildFencedImage({
      docker: {
        async buildImage() { return { imageId: "image-1" }; },
        async removeImage() { throw removalFailure; }
      },
      sourceContainerId: "dev-1", imageTag: "app:one", dockerfilePath: "Dockerfile",
      extraFiles: [],
      fence: { async assertCurrent() { if (++assertions === 2) throw lostFence; } }
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.deepEqual(error.errors, [lostFence, removalFailure]);
      return true;
    }
  );
});

test("a valid publish fence restores the original checkout when the operation fails", async () => {
  const checkouts = [];
  const operationFailure = new Error("build failed");
  await assert.rejects(
    withFencedCheckout({
      git: { async checkoutCommit(_projectId, commit) { checkouts.push(commit); } },
      projectId: "p1", targetCommit: "target", originalCommit: "original",
      fence: { async assertCurrent() {} },
      async operation() { throw operationFailure; }
    }),
    operationFailure
  );
  assert.deepEqual(checkouts, ["target", "original"]);
});

test("a valid publish fence restores the original checkout when target checkout partially fails", async () => {
  const checkouts = [];
  let current = "original";
  const checkoutFailure = new Error("target checkout reported failure after changing HEAD");
  await assert.rejects(
    withFencedCheckout({
      git: {
        async checkoutCommit(_projectId, commit) {
          checkouts.push(commit);
          current = commit;
          if (commit === "target") throw checkoutFailure;
        }
      },
      projectId: "project-1",
      targetCommit: "target",
      originalCommit: "original",
      fence: { async assertCurrent() {} },
      async operation() { assert.fail("a failed target checkout must not publish"); }
    }),
    checkoutFailure
  );
  assert.equal(current, "original");
  assert.deepEqual(checkouts, ["target", "original"]);
});

test("deployment cleanup stops between containers after deletion-fence takeover", async () => {
  const deps = buildPublishServiceDeps();
  const service = createPublishService(deps);
  await service.publish({ projectId: "p1", slug: "app", environment: "staging", publishedByUserId: "u1" });
  await service.publish({ projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1" });
  const deployments = deps.deployments.list("p1");
  const firstRemoved = deferred();
  const resumeFirst = deferred();
  const originalRemove = deps.docker.removeContainer.bind(deps.docker);
  const removed = [];
  deps.docker.removeContainer = async (containerId) => {
    removed.push(containerId);
    await originalRemove(containerId);
    firstRemoved.resolve();
    await resumeFirst.promise;
  };
  let current = true;
  const cleanup = service.deleteProject("p1", {
    epoch: 1,
    async assertCurrent() { if (!current) throw new Error("deletion ownership lost"); }
  });
  await firstRemoved.promise;
  current = false;
  resumeFirst.resolve();

  await assert.rejects(cleanup, /ownership lost/);
  assert.deepEqual(removed, [deployments[0].containerId]);
  assert.equal(deps.deployments.list("p1").length, 2, "deployment persistence must not run");
});

test("a queued publish rechecks its fence after waiting and never starts its image build", async () => {
  const blockerDeps = buildPublishServiceDeps();
  const blockerStarted = deferred();
  const resumeBlocker = deferred();
  const blockerBuild = blockerDeps.docker.buildImage.bind(blockerDeps.docker);
  blockerDeps.docker.buildImage = async (...args) => {
    blockerStarted.resolve();
    await resumeBlocker.promise;
    return blockerBuild(...args);
  };
  const blocker = createPublishService(blockerDeps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await blockerStarted.promise;

  const queuedDeps = buildPublishServiceDeps();
  const queueEntered = deferred();
  let current = true;
  queuedDeps.lifecycle = {
    async runChildMutation(_projectId, operation) {
      return operation({
        async assertCurrent() {
          queueEntered.resolve();
          if (!current) throw new Error("Project 'p1' is being deleted");
        }
      });
    }
  };
  const queued = createPublishService(queuedDeps).publish({
    projectId: "p1", slug: "app", environment: "production", publishedByUserId: "u1"
  });
  await queueEntered.promise;
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  resumeBlocker.resolve();

  await blocker;
  await assert.rejects(queued, /being deleted/);
  assert.equal(queuedDeps.docker.state.builds.length, 0);
});
