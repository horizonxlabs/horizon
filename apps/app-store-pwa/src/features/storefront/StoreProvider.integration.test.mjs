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
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;

const { act, create } = await import("react-test-renderer");
const { createStoreDeviceState } = await import("./device-state.ts");
const { StoreProvider, useStorefront } = await import("./StoreProvider.tsx");
const { StoreCollectionPage } = await import("./pages/StoreCollectionPage.tsx");
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

function RefreshProbe() {
  const { bootstrap, refreshHome } = useStorefront();
  return React.createElement(
    "button",
    { type: "button", onClick: () => void refreshHome() },
    `Refresh Store ${bootstrap.userName ?? "loading"}`
  );
}

function tree(store, page = "my-apps") {
  return React.createElement(
    StoreProvider,
    { store },
    React.createElement(
      StoreShell,
      { route: { page } },
      React.createElement(StoreCollectionPage, { page }),
      React.createElement(RefreshProbe)
    )
  );
}

function button(root, label) {
  const match = root.findAllByType("button").find((item) => item.children.join("").includes(label));
  assert.ok(match, `Expected ${label} button`);
  return match;
}

async function resolve(next, value) {
  await act(async () => {
    next.resolve(value);
    await Promise.resolve();
  });
}

test("mounted Provider loads API collections, updates device favorites/recent, and uses the real card handler", async () => {
  memory.clear();
  const load = deferred();
  const store = createStorefrontStateStore({
    initialBootstrap: initial,
    loadHome: () => load.promise,
    device: createStoreDeviceState(window.localStorage)
  });
  let renderer;
  await act(async () => { renderer = create(tree(store)); });
  assert.match(JSON.stringify(renderer.toJSON()), /Loading Horizon Store/);

  await resolve(load, ready);
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Available API App/);

  const favorite = renderer.root.findAllByProps({ "aria-label": "Add My API App to favorites on this device" })[0];
  await act(async () => { favorite.props.onClick(); });
  await act(async () => { renderer.update(tree(store, "favorites")); });
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);
  assert.match(JSON.stringify(renderer.toJSON()), /This device/);

  const card = renderer.root.findByProps({ className: "store-collection-main" });
  await act(async () => { card.props.onClick(); });
  assert.equal(window.location.pathname, "/store/apps/active-uninstalled");
  await act(async () => { renderer.update(tree(store, "recent")); });
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);
  await act(async () => { renderer.unmount(); });
});

test("mounted Provider suppresses stale refresh and preserves ready UI across real logout retry controls", async () => {
  memory.clear();
  const initialLoad = deferred();
  const firstRefresh = deferred();
  const secondRefresh = deferred();
  const loads = [initialLoad, firstRefresh, secondRefresh];
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
  let renderer;
  await act(async () => { renderer = create(tree(store)); });
  await resolve(initialLoad, ready);

  const refresh = button(renderer.root, "Refresh Store End User");
  await act(async () => { refresh.props.onClick(); refresh.props.onClick(); });
  await resolve(secondRefresh, ready);
  await resolve(firstRefresh, { ...ready, userName: "Stale user" });
  assert.match(JSON.stringify(renderer.toJSON()), /Refresh Store End User/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Stale user/);

  await act(async () => { button(renderer.root, "Logout").props.onClick(); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /Sign-out not completed/);
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);

  await act(async () => { button(renderer.root, "Retry sign out").props.onClick(); await Promise.resolve(); });
  assert.equal(signedOut, true);
  await act(async () => { renderer.unmount(); });
});
