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
const { StoreAppCard } = await import("./StoreAppCard.tsx");
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
  subdomain: slug,
  subdomainUrl: `https://${slug}.apps.example.com`,
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

function mountCards(client, apps) {
  return create(
    React.createElement(
      StoreProvider,
      { store: createStore(), client },
      React.createElement(
        React.Fragment,
        null,
        ...apps.map((app) => React.createElement(StoreAppCard, { app, key: app.slug }))
      )
    )
  );
}

const card = (slug, accessStatus, route) => ({
  id: slug,
  slug,
  name: `${slug} App`,
  description: "A supported app",
  owner: "IT",
  route,
  accessStatus,
  installStatus: "not_installed",
  health: "healthy"
});

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

test("card launch failure stays in Store and exposes the server error", async () => {
  memory.clear();
  window.location.pathname = "/store/search";
  const active = {
    ...card("active", "active", "/apps/active"),
    subdomainUrl: "https://active.apps.example.com"
  };
  let renderer;
  await act(async () => {
    renderer = mountCards(
      {
        authorizeStoreAppLaunch: async () => {
          throw new Error("Launch session unavailable");
        }
      },
      [active]
    );
  });
  await act(async () => {
    renderer.root
      .findByProps({ className: "store-app-primary" })
      .props.onClick({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.equal(window.location.pathname, "/store/search");
  assert.match(
    renderer.root.findByProps({ role: "alert" }).children.join(""),
    /Launch session unavailable/
  );
  await act(async () => renderer.unmount());
});

test("pending and available cards retain non-launch access actions", async () => {
  let launchCalls = 0;
  let renderer;
  await act(async () => {
    renderer = mountCards(
      {
        authorizeStoreAppLaunch: async () => {
          launchCalls += 1;
        }
      },
      [card("pending", "pending"), card("requestable", "available")]
    );
  });
  const actions = renderer.root.findAllByProps({ className: "store-app-primary" });
  assert.equal(
    actions.find((node) => node.children.join("") === "View request")?.props.href,
    "/store/access-requests"
  );
  assert.equal(
    actions.find((node) => node.children.join("") === "Request access")?.props.href,
    "/store/apps/requestable"
  );
  assert.equal(launchCalls, 0);
  await act(async () => renderer.unmount());
});

test("Open records recency and follows the server-authorized subdomain launch URL", async () => {
  memory.clear();
  window.location.pathname = "/store/apps/first";
  recentAtAssignment = undefined;
  launchAuthorizedAtAssignment = undefined;
  globalThis.__storeLaunchAuthorized = false;
  const client = {
    getStoreAppDetail: async () => detail(),
    authorizeStoreAppLaunch: async (appSlug, routePath) => {
      assert.equal(appSlug, "first");
      assert.equal(routePath, "/apps/first");
      globalThis.__storeLaunchAuthorized = true;
      return {
        authorized: true,
        launchUrl: "https://first.apps.example.com/__launch/detail-grant"
      };
    }
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client);
    await Promise.resolve();
  });
  const accessUrl = renderer.root.findByProps({ className: "store-app-access-url-value" });
  assert.equal(accessUrl.children.join(""), "https://first.apps.example.com");
  assert.equal(accessUrl.props.title, "https://first.apps.example.com");
  await act(async () => {
    button(renderer.root, "Open app").props.onClick();
  });
  assert.equal(window.location.pathname, "https://first.apps.example.com/__launch/detail-grant");
  assert.equal(launchAuthorizedAtAssignment, true);
  assert.deepEqual(recentAtAssignment, ["first"]);
  assert.deepEqual(createStoreDeviceState(window.localStorage).read().recent, ["first"]);
  await act(async () => {
    renderer.unmount();
  });
});

test("Open follows the server-authorized legacy path when no subdomain URL exists", async () => {
  memory.clear();
  window.location.pathname = "/store/apps/legacy";
  const legacyDetail = detail("legacy", ["open"]);
  delete legacyDetail.subdomain;
  delete legacyDetail.subdomainUrl;
  const client = {
    getStoreAppDetail: async () => legacyDetail,
    authorizeStoreAppLaunch: async (appSlug, routePath) => {
      assert.equal(appSlug, "legacy");
      assert.equal(routePath, "/apps/legacy");
      return { authorized: true, launchUrl: "/apps/legacy" };
    }
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client, "legacy");
    await Promise.resolve();
  });
  assert.equal(renderer.root.findAllByProps({ className: "store-app-access-url-value" }).length, 0);
  await act(async () => {
    button(renderer.root, "Open app").props.onClick();
  });
  assert.equal(window.location.pathname, "/apps/legacy");
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
