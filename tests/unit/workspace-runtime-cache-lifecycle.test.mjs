import assert from "node:assert/strict";
import test from "node:test";
import { createFixture } from "./workspace-orchestrator-warm-fixture.mjs";

const project = { projectId: "prj_local", slug: "current" };
const stale = {
  record: {
    id: "ws-prj-local",
    projectId: "prj_local",
    slug: "obsolete-recovery",
    resourceKey: "warm-obsolete",
    state: "running",
    containerId: "obsolete-container",
    cpuCores: 1,
    memoryMb: 2048,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    lastActivityAt: "2026-09-05T00:00:00.000Z"
  },
  llmGatewayKeyId: "obsolete-key"
};

const scenarios = [
  {
    name: "cold provisioning",
    fresh: true,
    ready: false,
    mutate: (fixture) => fixture.orchestrator.provisionWorkspace(project),
    state: "running",
    resourceKey: "prj-local"
  },
  {
    name: "warm provisioning",
    fresh: true,
    mutate: (fixture) => fixture.orchestrator.provisionWorkspace(project),
    state: "running"
  },
  {
    name: "failed warm handoff and cold fallback",
    fresh: true,
    failure: "persist",
    mutate: (fixture) => fixture.orchestrator.provisionWorkspace(project),
    state: "running",
    resourceKey: "prj-local"
  },
  {
    name: "hydration",
    async mutate(fixture) {
      const snapshot = fixture.snapshots.get(project.projectId);
      fixture.snapshots.set(project.projectId, {
        ...snapshot,
        record: { ...snapshot.record, slug: "hydrated", state: "idle" }
      });
      await fixture.orchestrator.hydrateRuntimeRecords(fixture.deps.runtimeRecords);
    },
    state: "idle",
    slug: "hydrated"
  },
  {
    name: "reattach",
    mutate: (fixture) => fixture.orchestrator.provisionWorkspace({ ...project, slug: "renamed" }),
    state: "running",
    slug: "renamed"
  },
  {
    name: "stop",
    mutate: (fixture) => fixture.orchestrator.stopWorkspace(project.projectId),
    state: "idle"
  },
  {
    name: "idle sweep",
    mutate: (fixture) => fixture.orchestrator.stopIdleWorkspaces(new Date("2099-01-01")),
    state: "idle"
  },
  {
    name: "wake",
    prepare: (fixture) => fixture.orchestrator.stopWorkspace(project.projectId),
    mutate: (fixture) => fixture.orchestrator.wakeWorkspace(project.projectId),
    state: "running"
  },
  {
    name: "container recreation",
    prepare: (fixture) =>
      fixture.prepared.docker.removeContainer(
        fixture.orchestrator.getWorkspace(project.projectId).containerId
      ),
    mutate: (fixture) => fixture.orchestrator.provisionWorkspace(project),
    state: "running"
  },
  {
    name: "archive",
    mutate: (fixture) => fixture.orchestrator.archiveWorkspace(project.projectId),
    state: "archived"
  },
  {
    name: "activity update",
    mutate: (fixture) => fixture.orchestrator.markActivity(project.projectId),
    state: "running"
  },
  {
    name: "deletion",
    mutate: (fixture) => fixture.orchestrator.deleteWorkspace(project.projectId),
    deleted: true
  }
];

for (const scenario of scenarios) {
  test(`${scenario.name} prevents an older recovery from replacing local runtime identity`, async () => {
    const fixture = await createFixture({ ready: scenario.ready, failure: scenario.failure });
    if (!scenario.fresh) await fixture.orchestrator.provisionWorkspace(project);
    await scenario.prepare?.(fixture);
    // Control only the recovery publication boundary; every lifecycle mutation uses the real API.
    fixture.deps.warmPool.reconcile = async (capture) => {
      const publication = capture(project.projectId);
      try {
        await scenario.mutate(fixture);
        publication.publish(stale);
      } finally {
        publication.release();
      }
    };
    await fixture.orchestrator.reconcileWarmPool();
    const cached = fixture.orchestrator.getWorkspace(project.projectId);
    if (scenario.deleted) {
      assert.equal(cached, null);
      assert.equal(fixture.snapshots.has(project.projectId), false);
    } else {
      assert.equal(cached.state, scenario.state);
      assert.equal(cached.slug, scenario.slug ?? "current");
      assert.equal(cached.resourceKey, scenario.resourceKey ?? "warm-resource-1");
      await fixture.orchestrator.deleteWorkspace(project.projectId);
    }
    const released = [...fixture.localCleanup, ...fixture.prepared.revokedKeys];
    assert.equal(released.includes("obsolete-key"), false);
    assert.equal(released.includes(scenario.resourceKey ? "cold-key-id" : "key-1"), true);
  });
}

test("provisioning invalidates recovery when it adopts the durable snapshot before reattach I/O", async () => {
  const fixture = await createFixture();
  await fixture.orchestrator.provisionWorkspace(project);
  const snapshot = fixture.snapshots.get(project.projectId);
  fixture.snapshots.set(project.projectId, {
    ...snapshot,
    record: { ...snapshot.record, slug: "durable-successor" }
  });
  let publication;
  let inspected = false;
  const inspect = fixture.prepared.docker.inspectContainer;
  fixture.prepared.docker.inspectContainer = async (...args) => {
    if (!inspected) {
      inspected = true;
      publication.publish(stale);
      assert.equal(fixture.orchestrator.getWorkspace(project.projectId).slug, "durable-successor");
    }
    return inspect(...args);
  };
  fixture.deps.warmPool.reconcile = async (capture) => {
    publication = capture(project.projectId);
    try {
      await fixture.orchestrator.provisionWorkspace({ ...project, slug: "latest-request" });
    } finally {
      publication.release();
    }
  };
  await fixture.orchestrator.reconcileWarmPool();
  assert.equal(inspected, true);
  assert.equal(fixture.orchestrator.getWorkspace(project.projectId).slug, "latest-request");
});

test("failed warm handoff invalidates recovery even when its removed cache record was absent", async () => {
  const fixture = await createFixture({ failure: "persist" });
  let capture;
  let publication;
  let cleaned = false;
  fixture.deps.warmPool.reconcile = async (beginRecovery) => {
    capture = beginRecovery;
  };
  await fixture.orchestrator.reconcileWarmPool();
  const remove = fixture.deps.runtimeRecords.remove;
  fixture.deps.runtimeRecords.remove = async (projectId) => {
    await remove(projectId);
    publication = capture(projectId);
    assert.equal(fixture.orchestrator.getWorkspace(projectId), null);
  };
  const failClaim = fixture.deps.warmPool.failClaim;
  fixture.deps.warmPool.failClaim = async (...args) => {
    cleaned = true;
    try {
      publication.publish(stale);
      assert.equal(fixture.orchestrator.getWorkspace(project.projectId), null);
    } finally {
      publication.release();
    }
    return failClaim(...args);
  };
  const recovered = await fixture.orchestrator.provisionWorkspace(project);
  assert.equal(cleaned, true);
  assert.equal(recovered.state, "running");
  assert.equal(recovered.resourceKey, "prj-local");
});
