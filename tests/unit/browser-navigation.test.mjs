import assert from "node:assert/strict";
import test from "node:test";

test("navigateBrowserPath updates history and emits a reactive navigation event", async () => {
  const originalWindow = globalThis.window;
  const target = new EventTarget();
  target.location = { pathname: "/admin" };
  target.history = {
    pushState(_state, _title, path) {
      target.location.pathname = path;
    },
    replaceState(_state, _title, path) {
      target.location.pathname = path;
    }
  };
  globalThis.window = target;
  const { navigateBrowserPath, EVCP_NAVIGATION_EVENT } =
    await import("../../packages/ui/src/browser-navigation.ts");
  let emitted = 0;
  target.addEventListener(EVCP_NAVIGATION_EVENT, () => emitted++);
  navigateBrowserPath("/admin/domains");
  assert.equal(target.location.pathname, "/admin/domains");
  assert.equal(emitted, 1);
  globalThis.window = originalWindow;
});
