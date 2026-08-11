import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

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
  const html = renderToStaticMarkup(
    React.createElement(StorefrontSummary, {
      route: { page: "my-apps" },
      userName: "End User",
      source: "Platform API",
      myAppsCount: 2,
      catalogCount: 5,
      requestCount: 0,
      ticketCount: 0,
      refreshPending: false,
      onRefresh() {},
      onLogout() {},
      logoutError: "network unavailable"
    })
  );

  assert.match(html, /Sign-out not completed/);
  assert.match(html, /Retry sign out/);
  assert.match(html, />Logout</);
  assert.match(html, /src="\/store\/horizon-mark\.png"/);
  assert.match(html, /class="horizon-brand-name">Horizon Store<\/span>/);
});

test("workspace chrome keeps grouped navigation, search, refresh, and logout recovery", () => {
  const html = renderToStaticMarkup(
    React.createElement(StorefrontSummary, {
      route: { page: "search" },
      userName: "End User",
      email: "user@example.com",
      source: "Platform API",
      role: "end_user",
      myAppsCount: 2,
      catalogCount: 5,
      requestCount: 1,
      ticketCount: 2,
      refreshPending: false,
      onRefresh() {},
      onLogout() {},
      logoutError: "network unavailable"
    })
  );
  assert.match(html, /Workspace/);
  assert.match(html, /Service/);
  assert.match(html, /Account/);
  assert.match(html, /Search applications/);
  assert.match(html, /Refresh Store/);
  assert.match(html, /Retry sign out/);
  assert.match(html, /horizon-mark\.png/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="store-navigation-drawer"/);
  assert.match(
    html,
    /<aside(?=[^>]*id="store-navigation-drawer")(?=[^>]*hidden="")(?=[^>]*aria-hidden="true")(?=[^>]*inert="")/
  );
});
