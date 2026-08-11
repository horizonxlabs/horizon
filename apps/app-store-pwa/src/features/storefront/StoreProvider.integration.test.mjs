import assert from "node:assert/strict";
import test from "node:test";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const memory = new Map();
globalThis.window = {
  location: {
    pathname: "/store/",
    hash: "",
    href: "http://localhost/store/",
    assign(path) {
      this.pathname = path;
    }
  },
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
  },
  history: {
    pushState(_state, _title, path) {
      window.location.pathname = path;
    },
    replaceState(_state, _title, path) {
      window.location.pathname = path;
    }
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
const { InstallationEvidenceProbe } = await import("./StoreAppDetailPage.integration.fixtures.mjs");
const { StoreProvider, useStorefront } = await import("./StoreProvider.tsx");
const { StoreCollectionPage } = await import("./pages/StoreCollectionPage.tsx");
const { StoreShell } = await import("./StoreShell.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const myApp = {
  id: "my",
  slug: "active-uninstalled",
  name: "My API App",
  description: "From myApps",
  owner: "People",
  accessStatus: "active",
  installStatus: "not_installed",
  health: "healthy"
};
const availableApp = {
  id: "available",
  slug: "catalog-app",
  name: "Available API App",
  description: "From availableApps",
  owner: "IT",
  accessStatus: "active",
  installStatus: "installed",
  health: "healthy"
};
const ready = {
  status: "ready",
  userName: "End User",
  email: "user@example.com",
  source: "Platform API",
  myApps: [myApp],
  availableApps: [availableApp]
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

test("mounted Provider loads API collections, updates favorites, and keeps detail navigation out of recent", async () => {
  memory.clear();
  const load = deferred();
  const store = createStorefrontStateStore({
    initialBootstrap: initial,
    loadHome: () => load.promise,
    device: createStoreDeviceState(window.localStorage)
  });
  let renderer;
  await act(async () => {
    renderer = create(tree(store));
  });
  assert.match(JSON.stringify(renderer.toJSON()), /Loading Horizon Store/);

  await resolve(load, ready);
  const myAppsView = JSON.stringify(renderer.toJSON());
  assert.match(myAppsView, /My API App/);
  assert.match(myAppsView, /Available API App/);
  assert.match(myAppsView, /People/);
  assert.doesNotMatch(myAppsView, /Access required/);

  const favorite = renderer.root.findAllByProps({
    "aria-label": "Add My API App to favorites on this device"
  })[0];
  await act(async () => {
    favorite.props.onClick();
  });
  await act(async () => {
    renderer.update(tree(store, "favorites"));
  });
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);
  assert.match(JSON.stringify(renderer.toJSON()), /This device/);

  const favoriteButton = renderer.root.findByProps({
    "aria-label": "Remove My API App from favorites on this device"
  });
  assert.equal(favoriteButton.props["aria-pressed"], true);

  const card = renderer.root.findByProps({ className: "store-app-detail-link" });
  await act(async () => {
    card.props.onClick({ preventDefault() {} });
  });
  assert.equal(window.location.pathname, "/store/apps/active-uninstalled");
  await act(async () => {
    renderer.update(tree(store, "recent"));
  });
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /My API App/);
  assert.match(JSON.stringify(renderer.toJSON()), /Open an application from its detail page/);
  await act(async () => {
    renderer.unmount();
  });
});

test("Store shell offers an in-place retry for service failures without mislabeling them as sign-in failures", async () => {
  memory.clear();
  let attempts = 0;
  const store = createStorefrontStateStore({
    initialBootstrap: initial,
    loadHome: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Store API is temporarily unavailable");
      return ready;
    },
    device: createStoreDeviceState(window.localStorage)
  });
  let renderer;
  await act(async () => {
    renderer = create(tree(store));
    await Promise.resolve();
  });

  assert.match(JSON.stringify(renderer.toJSON()), /Store unavailable/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Sign-in required/);
  await act(async () => {
    button(renderer.root, "Retry Store").props.onClick();
    await Promise.resolve();
  });
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);
  await act(async () => {
    renderer.unmount();
  });
});

test("an empty creator catalog explains how to publish the first Store app", async () => {
  memory.clear();
  const creatorHome = {
    ...ready,
    role: "creator",
    myApps: [],
    availableApps: []
  };
  const store = createStorefrontStateStore({
    initialBootstrap: creatorHome,
    loadHome: async () => creatorHome,
    device: createStoreDeviceState(window.localStorage)
  });
  let renderer;
  await act(async () => {
    renderer = create(tree(store));
    await Promise.resolve();
  });

  assert.match(JSON.stringify(renderer.toJSON()), /No apps published yet/);
  assert.ok(button(renderer.root, "Open Creator Workspace"));
  await act(async () => {
    renderer.unmount();
  });
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
    onLogoutSuccess: () => {
      signedOut = true;
    }
  });
  let renderer;
  await act(async () => {
    renderer = create(tree(store));
  });
  await resolve(initialLoad, ready);

  const refresh = button(renderer.root, "Refresh Store End User");
  await act(async () => {
    refresh.props.onClick();
    refresh.props.onClick();
  });
  await resolve(secondRefresh, ready);
  await resolve(firstRefresh, { ...ready, userName: "Stale user" });
  assert.match(JSON.stringify(renderer.toJSON()), /Refresh Store End User/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Stale user/);

  await act(async () => {
    button(renderer.root, "Logout").props.onClick();
    await Promise.resolve();
  });
  assert.match(JSON.stringify(renderer.toJSON()), /Sign-out not completed/);
  assert.match(JSON.stringify(renderer.toJSON()), /My API App/);

  await act(async () => {
    button(renderer.root, "Retry sign out").props.onClick();
    await Promise.resolve();
  });
  assert.equal(signedOut, true);
  await act(async () => {
    renderer.unmount();
  });
});

test("mounted Provider reconciles installation evidence only for the newest applied refresh", async () => {
  memory.clear();
  const staleSuccess = deferred();
  const newestSuccess = deferred();
  const staleFailure = deferred();
  const newestFailure = deferred();
  const alphaHome = {
    ...ready,
    myApps: [],
    availableApps: [{ ...availableApp, id: "alpha", slug: "alpha", name: "Alpha" }]
  };
  let load = 0;
  const store = createStorefrontStateStore({
    initialBootstrap: initial,
    loadHome: () => {
      load += 1;
      if (load === 1) return Promise.resolve(alphaHome);
      if (load === 2 || load === 5) return Promise.reject(new Error("retain confirmed evidence"));
      if (load === 3) return staleSuccess.promise;
      if (load === 4) return newestSuccess.promise;
      if (load === 6) return staleFailure.promise;
      if (load === 7) return newestFailure.promise;
      throw new Error(`Unexpected Store load ${load}`);
    },
    device: createStoreDeviceState(window.localStorage)
  });
  const pendingInstall = deferred();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store, client: {} },
        React.createElement(InstallationEvidenceProbe, { pendingInstall })
      )
    );
    await Promise.resolve();
  });

  await act(async () => {
    await button(renderer.root, "Remove alpha").props.onClick();
  });
  assert.match(JSON.stringify(renderer.toJSON()), /disabled\|none\|idle/);

  let staleRequest;
  let newestRequest;
  await act(async () => {
    staleRequest = button(renderer.root, "Refresh evidence").props.onClick();
    newestRequest = button(renderer.root, "Refresh evidence").props.onClick();
  });
  let staleResult;
  await act(async () => {
    staleSuccess.resolve(alphaHome);
    staleResult = await staleRequest;
  });
  assert.deepEqual(staleResult, { ok: true, applied: false });
  assert.match(JSON.stringify(renderer.toJSON()), /disabled\|none\|idle/);
  let newestResult;
  await act(async () => {
    newestSuccess.resolve(alphaHome);
    newestResult = await newestRequest;
  });
  assert.deepEqual(newestResult, { ok: true, applied: true });
  assert.match(JSON.stringify(renderer.toJSON()), /none\|none\|idle/);

  await act(async () => {
    await button(renderer.root, "Remove alpha").props.onClick();
  });
  assert.match(JSON.stringify(renderer.toJSON()), /disabled\|none\|idle/);
  await act(async () => {
    staleRequest = button(renderer.root, "Refresh evidence").props.onClick();
    newestRequest = button(renderer.root, "Refresh evidence").props.onClick();
  });
  await act(async () => {
    staleFailure.reject(new Error("superseded failure"));
    staleResult = await staleRequest;
  });
  assert.deepEqual(staleResult, { ok: true, applied: false });
  assert.match(JSON.stringify(renderer.toJSON()), /disabled\|none\|idle/);
  await act(async () => {
    newestFailure.reject(new Error("active failure"));
    newestResult = await newestRequest;
  });
  assert.equal(newestResult.ok, false);
  assert.equal(newestResult.error.message, "active failure");
  assert.equal(store.getSnapshot().bootstrap.status, "error");
  assert.match(JSON.stringify(renderer.toJSON()), /disabled\|none\|idle/);
  await act(async () => {
    renderer.unmount();
  });
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
