import assert from "node:assert/strict";
import test from "node:test";
import { createCrashedWarmStartupFixture, deferred } from "./workspace-warm-startup-fixture.mjs";

test(
  "startup recovery cannot overwrite a reattach and stop at the project lease release boundary",
  { timeout: 5_000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const replica = fixture.createReplica();
    const execute = fixture.persistence.client.$executeRawUnsafe;
    let intercepted = false;
    fixture.persistence.client.$executeRawUnsafe = async (...args) => {
      const result = await execute(...args);
      if (
        !intercepted &&
        args[0].trimStart().startsWith("DELETE FROM") &&
        args[1] === "prj_crash"
      ) {
        intercepted = true;
        await replica.orchestrator.provisionWorkspace({
          projectId: "prj_crash",
          slug: "renamed-successor"
        });
        await replica.orchestrator.stopWorkspace("prj_crash");
      }
      return result;
    };
    await replica.boot();
    assert.equal(intercepted, true);
    const cached = replica.orchestrator.getWorkspace("prj_crash");
    const [durable] = await fixture.runtimeRecords.list();
    assert.equal(cached.state, "idle");
    assert.equal(cached.slug, "renamed-successor");
    assert.equal(cached.state, durable.record.state);
    assert.equal(cached.slug, durable.record.slug);
    assert.equal(cached.resourceKey, durable.record.resourceKey);
    assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash"))?.running, false);
  }
);

test("recovery publishes the newly persisted runtime before releasing project ownership", async () => {
  const fixture = await createCrashedWarmStartupFixture();
  const replica = fixture.createReplica();
  const execute = fixture.persistence.client.$executeRawUnsafe;
  let publishedWhileOwned = false;
  fixture.persistence.client.$executeRawUnsafe = async (...args) => {
    if (args[0].trimStart().startsWith("DELETE FROM") && args[1] === "prj_crash") {
      const cached = replica.orchestrator.getWorkspace("prj_crash");
      publishedWhileOwned = cached?.resourceKey === "warm-resource-1";
      assert.equal(
        await fixture.runtimeRecords.provisioningLeases.acquire("prj_crash", "competitor", 1_000),
        "contended"
      );
    }
    return execute(...args);
  };
  await replica.boot();
  assert.equal(publishedWhileOwned, true);
  await replica.orchestrator.deleteWorkspace("prj_crash");
  assert.equal(fixture.revokedKeys.includes("key-1"), true);
});

test(
  "a delayed recovery commit response cannot publish after a successor takes project ownership",
  { timeout: 5_000 },
  async () => {
    const fixture = await createCrashedWarmStartupFixture();
    const replica = fixture.createReplica();
    const transaction = fixture.persistence.client.$transaction;
    const entered = deferred();
    const resume = deferred();
    let paused = false;
    fixture.persistence.client.$transaction = async (...args) => {
      const result = await transaction(...args);
      if (!paused && fixture.persistence.records.has("prj_crash")) {
        paused = true;
        entered.resolve();
        await resume.promise;
      }
      return result;
    };
    const stale = assert.rejects(replica.boot(), /lease is no longer owned/);
    await entered.promise;
    try {
      fixture.persistence.advance(1_001);
      await replica.orchestrator.provisionWorkspace({ projectId: "prj_crash", slug: "newer-slug" });
      await replica.orchestrator.stopWorkspace("prj_crash");
      resume.resolve();
      await stale;
      const cached = replica.orchestrator.getWorkspace("prj_crash");
      const [durable] = await fixture.runtimeRecords.list();
      assert.equal(cached.state, "idle");
      assert.equal(cached.slug, "newer-slug");
      assert.equal(cached.state, durable.record.state);
      assert.equal(cached.slug, durable.record.slug);
      assert.equal((await fixture.docker.inspectContainer("evcp-ws-prj-crash"))?.running, false);
    } finally {
      resume.resolve();
      await stale;
    }
  }
);
