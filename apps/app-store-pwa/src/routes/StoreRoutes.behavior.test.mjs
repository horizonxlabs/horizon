import assert from "node:assert/strict";
import test from "node:test";

const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  location: { pathname: "/store/search", hash: "", href: "http://localhost/store/search" },
  localStorage,
  history: { pushState() {}, replaceState() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {}
};
globalThis.document = { querySelector: () => null };
globalThis.React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { StoreRoutes } = await import("./StoreRoutes.tsx");
const { StorefrontSummary } = await import("../features/storefront/StorefrontSummary.tsx");

test("StoreRoutes composes the Store provider for Store URLs and preserves generated-app routing", () => {
  window.location.pathname = "/store/search";
  const store = renderToStaticMarkup(React.createElement(StoreRoutes));
  assert.match(store, /Loading Horizon Store/);

  window.location.pathname = "/apps/leave-management";
  const generated = renderToStaticMarkup(React.createElement(StoreRoutes));
  assert.match(generated, /Generated App Runtime/);
  assert.doesNotMatch(generated, /Loading Horizon Store/);
});

test("logout errors retain Store chrome and expose the real retry control", () => {
  const html = renderToStaticMarkup(React.createElement(StorefrontSummary, {
    userName: "End User",
    source: "Platform API",
    myAppsCount: 2,
    currentPath: "/store/",
    isSigningIn: false,
    onSignIn() {},
    onLogout() {},
    logoutError: "network unavailable"
  }));

  assert.match(html, /Sign-out not completed/);
  assert.match(html, /Retry sign out/);
  assert.match(html, />Logout</);
});
