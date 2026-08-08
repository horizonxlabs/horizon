import assert from "node:assert/strict";
import test from "node:test";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const memory = new Map();

globalThis.window = {
  location: {
    pathname: "/store/apps/capability-app",
    href: "http://localhost/store/apps/capability-app"
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
const { StoreProvider, useStorefront } = await import("./StoreProvider.tsx");
const { StoreAppDetailPage } = await import("./pages/StoreAppDetailPage.tsx");
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

function homeApp(accessStatus) {
  return {
    id: "capability-app",
    slug: "capability-app",
    name: "Capability App",
    description: "Capability workflow",
    owner: "Platform",
    accessStatus,
    installStatus: "not_installed",
    health: "healthy",
    route: "/apps/capability-app"
  };
}

function detail(accessStatus, actions) {
  return {
    ...homeApp(accessStatus),
    ownerName: "Platform",
    department: "IT",
    accessMode: "managed",
    myRole: accessStatus === "active" ? "member" : undefined,
    supportContact: "help@example.com",
    releaseNotes: ["Initial release"],
    actions
  };
}

function ready(app) {
  return {
    status: "ready",
    userName: "End User",
    email: "user@example.com",
    source: "Platform API",
    myApps: app.accessStatus === "active" ? [app] : [],
    availableApps: app.accessStatus === "active" ? [] : [app]
  };
}

function createStore(initial, homes) {
  return createStorefrontStateStore({
    initialBootstrap: ready(initial),
    loadHome: async () => ready(homes.shift() ?? initial),
    device: createStoreDeviceState(window.localStorage)
  });
}

function button(root, label) {
  return root.findAllByType("button").find((node) => node.children.join("").includes(label));
}

function output(renderer) {
  return JSON.stringify(renderer.toJSON());
}

let refreshHome;
function RefreshProbe() {
  refreshHome = useStorefront().refreshHome;
  return null;
}

test("an applied access approval refreshes View status to Open", async () => {
  memory.clear();
  const before = homeApp("pending");
  const after = homeApp("active");
  const details = [
    detail("pending", ["view_status"]),
    detail("active", ["open", "submit_ticket"])
  ];
  const store = createStore(before, [before, after]);
  const client = {
    getStoreAppDetail: async () => details.shift() ?? detail("active", ["open"])
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store, client },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(StoreAppDetailPage, { appSlug: "capability-app" }),
          React.createElement(RefreshProbe)
        )
      )
    );
    await Promise.resolve();
  });
  assert.ok(button(renderer.root, "View status"));

  await act(async () => {
    await refreshHome();
    await Promise.resolve();
  });

  assert.ok(button(renderer.root, "Open app"));
  assert.equal(button(renderer.root, "View status"), undefined);
  assert.equal(button(renderer.root, "Install"), undefined);
  await act(async () => renderer.unmount());
});

test("detail refresh hides stale Open while access capabilities are unresolved", async () => {
  memory.clear();
  const before = homeApp("active");
  const after = homeApp("pending");
  const capabilityRefresh = deferred();
  let detailCalls = 0;
  const client = {
    async getStoreAppDetail() {
      detailCalls += 1;
      if (detailCalls === 1) return detail("active", ["open", "submit_ticket"]);
      if (detailCalls === 2) return capabilityRefresh.promise;
      return detail("pending", ["view_status"]);
    }
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(before, [before, after]), client },
        React.createElement(
          React.Fragment,
          null,
          React.createElement(StoreAppDetailPage, { appSlug: "capability-app" }),
          React.createElement(RefreshProbe)
        )
      )
    );
    await Promise.resolve();
  });
  assert.ok(button(renderer.root, "Open app"));
  assert.ok(button(renderer.root, "Submit ticket"));

  await act(async () => {
    await refreshHome();
    await Promise.resolve();
  });

  assert.equal(button(renderer.root, "Open app"), undefined);
  assert.equal(button(renderer.root, "Submit ticket"), undefined);
  assert.match(output(renderer), /Refreshing current app actions/);
  await act(async () => {
    capabilityRefresh.reject(new Error("capability refresh offline"));
    await Promise.resolve();
  });
  assert.match(output(renderer), /Current app actions unavailable/);
  assert.match(output(renderer), /capability refresh offline/);

  await act(async () => {
    button(renderer.root, "Retry current actions").props.onClick();
    await Promise.resolve();
  });
  assert.ok(button(renderer.root, "View status"));
  assert.equal(button(renderer.root, "Open app"), undefined);
  await act(async () => renderer.unmount());
});

test("app detail loading and unavailable states keep an h1 and safe Apps return action", async () => {
  memory.clear();
  const pending = deferred();
  const client = { getStoreAppDetail: () => pending.promise };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(homeApp("active"), []), client },
        React.createElement(StoreAppDetailPage, { appSlug: "capability-app" })
      )
    );
  });
  assert.equal(renderer.root.findByType("h1").children.join(""), "App details");

  await act(async () => {
    pending.reject(new Error("detail offline"));
    await Promise.resolve();
  });
  assert.equal(renderer.root.findByType("h1").children.join(""), "App details");
  assert.match(output(renderer), /detail offline/);
  await act(async () => {
    button(renderer.root, "Return to Apps").props.onClick();
  });
  assert.equal(window.location.pathname, "/store/");
  await act(async () => renderer.unmount());
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
