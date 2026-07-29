import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
globalThis.window = {
  location: { pathname: "/store/", hash: "", href: "http://localhost/store/" },
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
  },
  history: {
    pushState(_state, _title, path) { window.location.pathname = path; },
    replaceState(_state, _title, path) { window.location.pathname = path; }
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {}
};
globalThis.document = { querySelector: () => null };
globalThis.React = (await import("react")).default;

const { renderToStaticMarkup } = await import("react-dom/server");
const { createStoreDeviceState } = await import("./device-state.ts");
const { StoreProvider } = await import("./StoreProvider.tsx");
const { StoreCollectionPage, navigateToStoreApp } = await import("./pages/StoreCollectionPage.tsx");
const { StoreShell } = await import("./StoreShell.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

const myApp = {
  id: "my", slug: "active-uninstalled", name: "My API App", description: "From myApps", owner: "People",
  accessStatus: "active", installStatus: "not_installed", health: "healthy"
};
const availableApp = {
  id: "available", slug: "catalog-app", name: "Available API App", description: "From availableApps", owner: "IT",
  accessStatus: "active", installStatus: "installed", health: "healthy"
};
const ready = {
  status: "ready", userName: "End User", email: "user@example.com", source: "Platform API",
  myApps: [myApp], availableApps: [availableApp]
};
const initial = { status: "loading", source: "Platform API", myApps: [], availableApps: [] };

function renderCollection(store, page) {
  return renderToStaticMarkup(React.createElement(
    StoreProvider,
    { store },
    React.createElement(StoreCollectionPage, { page })
  ));
}

test("Provider wiring sends explicit API collections and device storage into real collection pages", async () => {
  const device = createStoreDeviceState(window.localStorage);
  device.toggleFavorite(availableApp.slug);
  const store = createStorefrontStateStore({ initialBootstrap: initial, loadHome: async () => ready, device });
  await store.refresh();

  const myApps = renderCollection(store, "my-apps");
  const available = renderCollection(store, "available");
  const favorites = renderCollection(store, "favorites");

  assert.match(myApps, /My API App/);
  assert.doesNotMatch(myApps, /Available API App/);
  assert.match(available, /Available API App/);
  assert.doesNotMatch(available, /My API App/);
  assert.match(favorites, /Available API App/);
  assert.match(favorites, /This device/);
});

test("Provider-owned refresh sequencing, logout retry, and card navigation retain real Store behavior", async () => {
  const first = deferred();
  const second = deferred();
  let loads = [first, second];
  let logoutAttempts = 0;
  let signedOut = false;
  const store = createStorefrontStateStore({
    initialBootstrap: initial,
    loadHome: () => loads.shift().promise,
    logout: async () => {
      logoutAttempts += 1;
      if (logoutAttempts === 1) throw new Error("network unavailable");
    },
    device: createStoreDeviceState(window.localStorage),
    onLogoutSuccess: () => { signedOut = true; }
  });

  const stale = store.refresh();
  const latest = store.refresh();
  second.resolve(ready);
  await latest;
  first.resolve({ ...ready, userName: "Stale user" });
  await stale;
  assert.equal(store.getSnapshot().bootstrap.userName, "End User");

  await store.logout();
  assert.equal(store.getSnapshot().bootstrap.status, "ready");
  assert.equal(store.getSnapshot().logoutError, "network unavailable");
  const retry = renderToStaticMarkup(React.createElement(
    StoreProvider,
    { store },
    React.createElement(StoreShell, { route: { page: "my-apps" } }, React.createElement("div"))
  ));
  assert.match(retry, /Retry sign out/);

  await store.logout();
  assert.equal(signedOut, true);

  navigateToStoreApp("catalog app");
  assert.equal(window.location.pathname, "/store/apps/catalog%20app");
});
