import assert from "node:assert/strict";
import test from "node:test";

const { createStorefrontAsyncController } = await import(
  "../../apps/app-store-pwa/src/features/storefront/store-async.ts"
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("stale refresh and unmounted results cannot replace the latest Store state", async () => {
  const first = deferred();
  const second = deferred();
  const events = [];
  const loads = [first, second];
  const controller = createStorefrontAsyncController({
    loadHome: () => loads.shift().promise,
    logout: async () => undefined,
    onRefreshStart: () => events.push("start"),
    onRefreshSuccess: (value) => events.push(`ready:${value}`),
    onRefreshFailure: () => events.push("failure"),
    onLogoutStart: () => events.push("logout:start"),
    onLogoutFailure: () => events.push("logout:failure"),
    onLogoutSuccess: () => events.push("logout:success")
  });

  const firstRefresh = controller.refresh();
  const secondRefresh = controller.refresh();
  second.resolve("latest");
  await secondRefresh;
  first.resolve("stale");
  await firstRefresh;
  controller.unmount();

  assert.deepEqual(events, ["start", "start", "ready:latest"]);
});

test("logout failure keeps the ready Store session and leaves a retry path", async () => {
  let bootstrap = { status: "ready", userName: "End User" };
  let logoutError;
  const controller = createStorefrontAsyncController({
    loadHome: async () => bootstrap,
    logout: async () => { throw new Error("network unavailable"); },
    onRefreshStart: () => undefined,
    onRefreshSuccess: () => undefined,
    onRefreshFailure: () => undefined,
    onLogoutStart: () => { logoutError = undefined; },
    onLogoutFailure: (error) => { logoutError = error.message; },
    onLogoutSuccess: () => { bootstrap = { status: "error" }; }
  });

  await controller.logout();

  assert.equal(bootstrap.status, "ready");
  assert.equal(logoutError, "network unavailable");
});
