import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceLiveFixture } from "./workspace-live-fixture.mjs";

test(
  "a prepared slot is claimed without resource creation and asynchronously refilled",
  {
    skip: process.env.EVCP_WARM_POOL_LIVE !== "1",
    timeout: 300_000
  },
  async (context) => {
    const fixture = await createWorkspaceLiveFixture(context, { targetSize: 1 });
    const { orchestrator, projectId, projectKey, docker, store, calls, audits } = fixture;
    await orchestrator.ensureWarmPoolCapacity();
    assert.equal((await orchestrator.getWarmPoolStatus()).ready, 1);
    const [prepared] = await store.list();
    const checkpoint = { ...calls };
    assert.deepEqual(checkpoint, { schemas: 1, buckets: 1, keys: 1 });

    // Hold only the asynchronous refill so all request-path creation is measured unambiguously.
    fixture.holdRefill();
    const record = await orchestrator.provisionWorkspace({ projectId, slug: projectKey });
    assert.equal(record.state, "running");
    assert.equal(record.resourceKey, prepared.resourceKey);
    assert.notEqual(record.resourceKey, projectKey);
    assert.ok(record.containerId);
    assert.notEqual(record.containerId, prepared.containerId);
    assert.deepEqual(calls, checkpoint, "claim must not create a schema, bucket, or LiteLLM key");
    assert.equal((await store.list()).length, 0, "claimed row retires after durable handoff");
    assert.ok(audits.some((event) => event.action === "workspace.pool_claimed"));
    assert.equal(
      audits.some((event) => event.action === "workspace.pool_cold_fallback"),
      false
    );
    const preview = await docker.execInContainer(record.containerId, [
      "curl",
      "-fsS",
      `http://127.0.0.1:3000/preview/${projectKey}/api/health`
    ]);
    assert.equal(preview.exitCode, 0, "project preview must be healthy at its logical URL");
    context.diagnostic(
      "warm claim healthy; request-path creation delta: schemas=0 buckets=0 keys=0"
    );

    await fixture.releaseRefill();
    assert.equal((await orchestrator.getWarmPoolStatus()).ready, 1);
    assert.deepEqual(calls, { schemas: 2, buckets: 2, keys: 2 });
    const [replacement] = await store.list();
    assert.notEqual(replacement.resourceKey, record.resourceKey);
    context.diagnostic("asynchronous refill restored one ready anonymous slot");
  }
);
