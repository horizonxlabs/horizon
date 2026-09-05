import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } =
  await import("../../apps/platform-api/src/platform-services.ts");
const { startWorkspaceIdleSweep } = await import("../../apps/platform-api/src/app-factory.ts");

test("application close stops both idle and warm-pool sweeps", async (t) => {
  const { createPlatformApiApp } = await import("../../apps/platform-api/src/app-factory.ts");
  const services = createPlatformApiServices();
  let idleCalls = 0;
  let refillCalls = 0;
  services.workspaceOrchestrator.stopIdleWorkspaces = async () => {
    idleCalls += 1;
    return [];
  };
  services.workspaceOrchestrator.ensureWarmPoolCapacity = async () => {
    refillCalls += 1;
  };
  t.mock.timers.enable({ apis: ["setInterval"] });
  const app = await createPlatformApiApp(services);
  try {
    t.mock.timers.tick(60_000);
    await new Promise(setImmediate);
    assert.equal(idleCalls, 1);
    assert.equal(refillCalls, 1);
  } finally {
    await app.close();
  }
  t.mock.timers.tick(120_000);
  await new Promise(setImmediate);
  assert.equal(idleCalls, 1);
  assert.equal(refillCalls, 1);
});

test("startWorkspaceIdleSweep returns a stoppable handle bound to the services orchestrator", () => {
  const services = createPlatformApiServices();
  const handle = startWorkspaceIdleSweep(services, { intervalMs: 60_000 });
  assert.equal(typeof handle.stop, "function");
  handle.stop();
});
