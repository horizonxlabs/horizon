import assert from "node:assert/strict";
import test from "node:test";

import * as liveFixture from "./workspace-live-fixture.mjs";
import { createFixture } from "../unit/workspace-orchestrator-warm-fixture.mjs";
import { resolvePreviewTarget } from "../../apps/platform-api/src/workspace-orchestrator/routes.ts";
import * as acceptanceActions from "./workspace-hot-actions.mjs";

const noLifecycleCalls = {
  createContainer: 0,
  startContainer: 0,
  stopContainer: 0,
  removeContainer: 0
};

test("contract: production generation resolves logical ownership for file edits and allowed commands", async () => {
  const fixture = await createFixture();
  const record = await fixture.orchestrator.provisionWorkspace({
    projectId: "prj_actions",
    slug: "actions"
  });
  const docker = fixture.prepared.docker;
  const files = new Map();
  const inspect = docker.inspectContainer.bind(docker);
  docker.execInContainer = async (containerId, command) => {
    assert.equal(
      (await inspect("evcp-ws-warm-resource-1"))?.containerId,
      containerId,
      "generation must address the claimed physical container"
    );
    const script = command.at(-1);
    let stdout = "";
    const write = script.match(/echo ([A-Za-z0-9+/=]+) \| base64 -d > '([^']+)'/);
    if (write) files.set(write[2], Buffer.from(write[1], "base64").toString("utf8"));
    else if (script.includes("===EVCPFILE:"))
      stdout = [...files].map(([path, content]) => `===EVCPFILE:${path}===\n${content}\n`).join("");
    else if (script.startsWith("base64 <"))
      stdout = Buffer.from(files.get("public/hot-handoff-acceptance.md") ?? "").toString("base64");
    else if (script.startsWith("wc -c <")) stdout = "-1";
    else if (script.includes("comparison_tree=")) stdout = "true";
    else if (script.includes("commit --no-verify -q -m")) stdout = "a".repeat(40);
    return { stdout, stderr: "", exitCode: 0 };
  };
  docker.execInContainerStream = async (id, command, onChunk) => {
    const result = await docker.execInContainer(id, command);
    onChunk(result.stdout);
    return { exitCode: result.exitCode };
  };
  const actions = await acceptanceActions.runHotWorkspaceActions({
    orchestrator: fixture.orchestrator,
    docker,
    projectId: record.projectId,
    actor: { id: "owner", email: "owner@workspace-live.invalid", name: "Owner", role: "creator" },
    expectedContainerId: record.containerId
  });
  await actions.assertFilePersists();
});

test("contract: hot claim preserves its running allocation and logical ownership through deletion", async () => {
  const fixture = await createFixture();
  const { orchestrator, slot, prepared } = fixture;
  const refillGate = Promise.withResolvers();
  let refill;
  fixture.deps.warmPool.ensureCapacity = () => {
    refill = refillGate.promise.then(() => prepared.pool.ensureCapacity());
    return refill;
  };
  const metrics = liveFixture.instrumentWorkspaceLifecycle(prepared.docker);
  const before = metrics.snapshot();
  const record = await orchestrator.provisionWorkspace({
    projectId: "prj_acceptance",
    slug: "acceptance"
  });
  assert.deepEqual(metrics.since(before), noLifecycleCalls);
  assert.equal(record.containerId, slot.containerId);
  assert.equal(record.resourceKey, slot.resourceKey);
  const auth = { userId: "owner", roles: [], projectIds: [record.projectId] };
  assert.deepEqual(await resolvePreviewTarget(orchestrator, null, record.resourceKey), {
    ok: false,
    status: 401
  });
  assert.deepEqual(
    await resolvePreviewTarget(
      orchestrator,
      { ...auth, projectIds: [record.resourceKey] },
      record.resourceKey
    ),
    { ok: false, status: 403 }
  );
  assert.deepEqual(await resolvePreviewTarget(orchestrator, auth, record.resourceKey), {
    ok: true,
    upstream: "http://evcp-ws-warm-resource-1:3000"
  });
  assert.ok(refill, "claim schedules refill without awaiting it");
  refillGate.resolve();
  await refill;
  assert.equal((await orchestrator.getWarmPoolStatus()).ready, 1);
  assert.equal(
    (await prepared.store.list()).some((entry) => entry.resourceKey === slot.resourceKey),
    false
  );
  assert.deepEqual(metrics.since(before), {
    ...noLifecycleCalls,
    createContainer: 1,
    startContainer: 1
  });
  await orchestrator.stopWorkspace(record.projectId);
  assert.equal((await prepared.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running, false);
  await resolvePreviewTarget(orchestrator, auth, record.resourceKey);
  assert.equal(orchestrator.getWorkspace(record.projectId).containerId, slot.containerId);
  assert.equal((await prepared.docker.inspectContainer("evcp-ws-warm-resource-1"))?.running, true);
  await orchestrator.deleteWorkspace(record.projectId);
  assert.equal((await prepared.docker.inspectContainer("evcp-ws-warm-resource-1")) === null, true);
  assert.equal(fixture.snapshots.has(record.projectId), false);
  assert.deepEqual(await orchestrator.listSecretNames(record.projectId), []);
  assert.equal(
    (await prepared.docker.listManagedVolumes()).some(
      (volume) => volume.name === "evcp-ws-warm-resource-1-data"
    ),
    false
  );
});

test(
  "live: hot claim reaches authorized physical preview in under 3s, refills three slots, and cleans up",
  {
    skip:
      process.env.EVCP_WARM_POOL_LIVE !== "1" &&
      "requires EVCP_WARM_POOL_LIVE=1 and isolated real-adapter prerequisites",
    timeout: 300_000
  },
  async (context) => {
    const targetSize = 3;
    const fixture = await liveFixture.createWorkspaceLiveFixture(context, { targetSize });
    const { orchestrator, projectId, projectKey, docker, dockerMetrics, store, calls, audits } =
      fixture;
    await orchestrator.ensureWarmPoolCapacity();
    assert.equal((await orchestrator.getWarmPoolStatus()).ready, targetSize);
    const readySlots = await store.list();
    for (const slot of readySlots) {
      const container = await docker.inspectContainer(`evcp-ws-${slot.resourceKey}`);
      assert.equal(container?.containerId, slot.containerId);
      assert.equal(container?.running, true);
      assert.equal(
        container?.image,
        fixture.image,
        "ready slots must use the configured release image"
      );
    }
    const checkpoint = { ...calls };
    assert.deepEqual(checkpoint, { schemas: 3, buckets: 3, keys: 3 });

    // Hold only the asynchronous refill so all request-path creation is measured unambiguously.
    fixture.holdRefill();
    const lifecycleBefore = dockerMetrics.snapshot();
    const startedAt = performance.now();
    const record = await orchestrator.provisionWorkspace({ projectId, slug: projectKey });
    const prepared = readySlots.find((slot) => slot.resourceKey === record.resourceKey);
    assert.ok(Boolean(prepared), "claim must reuse one of the observed ready allocations");
    assert.equal(record.state, "running");
    assert.equal(record.resourceKey, prepared.resourceKey);
    assert.notEqual(record.resourceKey, projectKey);
    assert.ok(record.containerId);
    assert.equal(record.containerId, prepared.containerId);
    assert.deepEqual(dockerMetrics.since(lifecycleBefore), noLifecycleCalls);
    assert.deepEqual(calls, checkpoint, "claim must not create a schema, bucket, or LiteLLM key");
    assert.equal(
      (await store.list()).some((slot) => slot.id === prepared.id),
      false,
      "claimed row retires after durable handoff"
    );
    assert.ok(audits.some((event) => event.action === "workspace.pool_claimed"));
    assert.equal(
      audits.some((event) => event.action === "workspace.pool_cold_fallback"),
      false
    );
    const auth = { userId: fixture.ownerId, roles: [], projectIds: [projectId] };
    const resolution = await resolvePreviewTarget(orchestrator, auth, record.resourceKey);
    assert.equal(resolution.ok, true);
    assert.equal(resolution.upstream, `http://evcp-ws-${record.resourceKey}:3000`);
    const healthUrl = `${resolution.upstream}/preview/${record.resourceKey}/api/health`;
    const preview = await docker.execInContainer(record.containerId, [
      "curl",
      "-fsS",
      "--max-time",
      "3",
      healthUrl
    ]);
    assert.equal(preview.exitCode, 0, "authorized physical preview must be healthy");
    const previewMs = performance.now() - startedAt;
    assert.ok(
      previewMs < 3000,
      `claim to authorized preview took ${Math.round(previewMs)} ms; budget is <3000 ms`
    );
    assert.deepEqual(dockerMetrics.since(lifecycleBefore), noLifecycleCalls);
    const assertSameContainer = async (running = true) => {
      const current = orchestrator.getWorkspace(projectId);
      assert.equal(current?.resourceKey, prepared.resourceKey);
      assert.equal(current?.containerId, prepared.containerId);
      const physical = await docker.inspectContainer(`evcp-ws-${record.resourceKey}`);
      assert.equal(physical?.containerId, prepared.containerId);
      assert.equal(physical?.running, running);
    };
    await assertSameContainer();
    context.diagnostic(
      `warm claim preview=${Math.round(previewMs)}ms; foreground create/start/stop/remove=0; schemas/buckets/keys=0`
    );

    await fixture.releaseRefill();
    assert.equal((await orchestrator.getWarmPoolStatus()).ready, targetSize);
    assert.deepEqual(calls, { schemas: 4, buckets: 4, keys: 4 });
    const refilled = await store.list();
    assert.equal(
      refilled.some((slot) => slot.resourceKey === record.resourceKey),
      false
    );
    const replacement = refilled.find(
      (slot) => !readySlots.some((ready) => ready.resourceKey === slot.resourceKey)
    );
    assert.ok(Boolean(replacement), "refill uses a fresh physical allocation");
    assert.equal(
      (await docker.inspectContainer(`evcp-ws-${replacement.resourceKey}`))?.image,
      fixture.image
    );
    await assertSameContainer();
    context.diagnostic("asynchronous refill restored three matching-image ready slots");

    assert.deepEqual(await resolvePreviewTarget(orchestrator, null, record.resourceKey), {
      ok: false,
      status: 401
    });
    assert.deepEqual(
      await resolvePreviewTarget(
        orchestrator,
        { ...auth, projectIds: [record.resourceKey] },
        record.resourceKey
      ),
      { ok: false, status: 403 }
    );
    const actions = await acceptanceActions.runHotWorkspaceActions({
      orchestrator,
      docker,
      projectId,
      actor: {
        id: auth.userId,
        email: "owner@workspace-live.invalid",
        name: "Live owner",
        role: "creator"
      },
      expectedContainerId: prepared.containerId
    });
    await actions.assertFilePersists();
    await assertSameContainer();
    const beforeStop = dockerMetrics.snapshot();
    await orchestrator.stopWorkspace(projectId);
    await assertSameContainer(false);
    await orchestrator.wakeWorkspace(projectId);
    await assertSameContainer();
    assert.deepEqual(dockerMetrics.since(beforeStop), {
      ...noLifecycleCalls,
      stopContainer: 1,
      startContainer: 1
    });
    await actions.assertFilePersists();
    assert.equal(
      (
        await docker.execInContainer(record.containerId, [
          "curl",
          "-fsS",
          "--max-time",
          "3",
          healthUrl
        ])
      ).exitCode,
      0
    );
    await orchestrator.deleteWorkspace(projectId);
    await fixture.assertResourcesRemoved({ resourceKey: record.resourceKey });
    assert.equal(orchestrator.getWorkspace(projectId), null);
    assert.deepEqual(await resolvePreviewTarget(orchestrator, auth, record.resourceKey), {
      ok: false,
      status: 404
    });
    assert.equal((await orchestrator.getWarmPoolStatus()).ready, targetSize);
    context.diagnostic(
      "claimed physical container/volume/schema/role/bucket/identity/key and durable credentials/runtime removed"
    );
  }
);
