import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { startWorkspaceIdleSweep } = await import("../../apps/platform-api/src/app-factory.ts");

test("startWorkspaceIdleSweep returns a stoppable handle bound to the services orchestrator", () => {
  const services = createPlatformApiServices();
  const handle = startWorkspaceIdleSweep(services, { intervalMs: 60_000 });
  assert.equal(typeof handle.stop, "function");
  handle.stop();
});
