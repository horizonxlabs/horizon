import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../../${specifier.slice(2)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const memory = new Map();
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalReact = globalThis.React;
let recentAtAssignment;
let launchAuthorizedAtAssignment;
globalThis.window = {
  location: {
    pathname: "/store/apps/first",
    hash: "",
    href: "http://localhost/store/apps/first",
    assign(path) {
      recentAtAssignment = createStoreDeviceState(window.localStorage).read().recent;
      launchAuthorizedAtAssignment = Boolean(globalThis.__storeLaunchAuthorized);
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
      window.location.pathname = String(path);
    },
    replaceState(_state, _title, path) {
      window.location.pathname = String(path);
    }
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {}
};
globalThis.document = { querySelector: () => null, title: "Store" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;

const { act, create } = await import("react-test-renderer");
const { createStoreDeviceState } = await import("./device-state.ts");
const { StoreProvider } = await import("./StoreProvider.tsx");
const { StoreAppDetailPage } = await import("./pages/StoreAppDetailPage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

const home = {
  status: "ready",
  userName: "End User",
  email: "user@example.com",
  source: "Platform API",
  myApps: [],
  availableApps: []
};
const detail = (slug = "first", actions = ["open", "submit_ticket"]) => ({
  id: slug,
  slug,
  name: `${slug} App`,
  description: "A supported app",
  ownerName: "IT",
  ownerUserId: "owner",
  department: "IT",
  accessMode: "role_based",
  availableRoles: ["member"],
  releaseNotes: ["Ready"],
  supportContact: "help@example.com",
  actions,
  route: `/apps/${slug}`,
  accessStatus: "active",
  installStatus: "not_installed",
  health: "healthy",
  version: "1.0.0",
  lastUpdated: "2026-07-29",
  primaryAction: "open"
});

function createStore(loadHome = async () => home) {
  return createStorefrontStateStore({
    initialBootstrap: home,
    loadHome,
    device: createStoreDeviceState(window.localStorage)
  });
}

function mount(store, client, slug = "first") {
  return create(
    React.createElement(
      StoreProvider,
      { store, client },
      React.createElement(StoreAppDetailPage, { appSlug: slug })
    )
  );
}

function button(root, label) {
  const item = root.findAllByType("button").find((node) => node.children.join("").includes(label));
  assert.ok(item, `Expected ${label} button`);
  return item;
}

test("Open stays in Store and shows an error when launch authorization fails", async () => {
  memory.clear();
  window.location.pathname = "/store/apps/first";
  const client = {
    getStoreAppDetail: async () => detail(),
    authorizeStoreAppLaunch: async () => {
      throw new Error("Launch access expired");
    }
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client);
    await Promise.resolve();
  });
  await act(async () => {
    button(renderer.root, "Open app").props.onClick();
    await Promise.resolve();
  });
  assert.equal(window.location.pathname, "/store/apps/first");
  assert.match(JSON.stringify(renderer.toJSON()), /Launch access expired/);
  await act(async () => renderer.unmount());
});

test("Open records recency and authorizes launch before assigning the published runtime route", async () => {
  memory.clear();
  window.location.pathname = "/store/apps/first";
  recentAtAssignment = undefined;
  launchAuthorizedAtAssignment = undefined;
  globalThis.__storeLaunchAuthorized = false;
  const client = {
    getStoreAppDetail: async () => detail(),
    authorizeStoreAppLaunch: async () => {
      globalThis.__storeLaunchAuthorized = true;
      return { authorized: true };
    }
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client);
    await Promise.resolve();
  });
  await act(async () => {
    button(renderer.root, "Open app").props.onClick();
  });
  assert.equal(window.location.pathname, "/apps/first");
  assert.equal(launchAuthorizedAtAssignment, true);
  assert.deepEqual(recentAtAssignment, ["first"]);
  assert.deepEqual(createStoreDeviceState(window.localStorage).read().recent, ["first"]);
  await act(async () => {
    renderer.unmount();
  });
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
