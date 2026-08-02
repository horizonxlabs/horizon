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
    href: "http://localhost/store/apps/capability-app",
    assign(path) {
      this.pathname = String(path);
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

function homeApp(accessStatus, installStatus) {
  return {
    id: "capability-app",
    slug: "capability-app",
    name: "Capability App",
    description: "Capability workflow",
    owner: "Platform",
    accessStatus,
    installStatus,
    health: "healthy",
    route: "/apps/capability-app"
  };
}

function detail(accessStatus, installStatus, actions) {
  return {
    id: "capability-app",
    slug: "capability-app",
    name: "Capability App",
    description: "Capability workflow",
    ownerName: "Platform",
    department: "IT",
    accessMode: "managed",
    accessStatus,
    installStatus,
    myRole: accessStatus === "active" ? "member" : undefined,
    route: "/apps/capability-app",
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

test("install refreshes mutually exclusive detail capabilities to Open and Remove", async () => {
  memory.clear();
  const before = homeApp("active", "not_installed");
  const after = homeApp("active", "installed");
  const details = [
    detail("active", "not_installed", ["install", "submit_ticket"]),
    detail("active", "installed", ["open", "uninstall", "submit_ticket"])
  ];
  let detailCalls = 0;
  const client = {
    getStoreAppDetail: async () => {
      detailCalls += 1;
      return details.shift() ?? details.at(-1);
    },
    installStoreApp: async () => ({
      id: "installation",
      appSlug: "capability-app",
      status: "active",
      installedAt: "2026-07-29"
    })
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
  assert.ok(button(renderer.root, "Install"));

  await act(async () => {
    button(renderer.root, "Install").props.onClick();
    await Promise.resolve();
  });

  assert.ok(detailCalls >= 2);
  assert.ok(button(renderer.root, "Open app"));
  assert.ok(button(renderer.root, "Remove"));
  assert.equal(button(renderer.root, "Install"), undefined);
  await act(async () => renderer.unmount());
});

test("confirmed install reloads detail capabilities even when home evidence is unchanged", async () => {
  memory.clear();
  const unchangedHome = homeApp("active", "not_installed");
  const details = [
    detail("active", "not_installed", ["install"]),
    detail("active", "installed", ["open", "uninstall"])
  ];
  let detailCalls = 0;
  const client = {
    getStoreAppDetail: async () => {
      detailCalls += 1;
      return details.shift() ?? details.at(-1);
    },
    installStoreApp: async () => ({
      id: "installation",
      appSlug: "capability-app",
      status: "active",
      installedAt: "2026-07-29"
    })
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(unchangedHome, [unchangedHome, unchangedHome]), client },
        React.createElement(StoreAppDetailPage, { appSlug: "capability-app" })
      )
    );
    await Promise.resolve();
  });
  await act(async () => {
    button(renderer.root, "Install").props.onClick();
    await Promise.resolve();
  });
  assert.ok(detailCalls >= 2);
  assert.ok(button(renderer.root, "Open app"));
  assert.ok(button(renderer.root, "Remove"));
  assert.equal(button(renderer.root, "Install"), undefined);
  await act(async () => renderer.unmount());
});

test("uninstall refreshes mutually exclusive detail capabilities to Install only", async () => {
  memory.clear();
  const before = homeApp("active", "installed");
  const after = homeApp("active", "not_installed");
  const details = [
    detail("active", "installed", ["open", "uninstall"]),
    detail("active", "not_installed", ["install", "submit_ticket"])
  ];
  const client = {
    getStoreAppDetail: async () => details.shift() ?? details.at(-1),
    uninstallStoreApp: async () => ({
      id: "installation",
      appSlug: "capability-app",
      status: "disabled",
      installedAt: "2026-07-29",
      uninstalledAt: "2026-07-29"
    })
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(before, [before, after]), client },
        React.createElement(StoreAppDetailPage, { appSlug: "capability-app" })
      )
    );
    await Promise.resolve();
  });

  await act(async () => {
    button(renderer.root, "Remove").props.onClick();
    await Promise.resolve();
  });

  assert.ok(button(renderer.root, "Install"));
  assert.equal(button(renderer.root, "Open app"), undefined);
  assert.equal(button(renderer.root, "Remove"), undefined);
  await act(async () => renderer.unmount());
});

test("an applied access-status home refresh reloads API-backed detail actions", async () => {
  memory.clear();
  const before = homeApp("pending", "not_installed");
  const after = homeApp("active", "installed");
  const details = [
    detail("pending", "not_installed", ["request_access"]),
    detail("active", "installed", ["open", "uninstall"])
  ];
  const store = createStore(before, [before, after]);
  const client = {
    getStoreAppDetail: async () => details.shift() ?? details.at(-1)
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
  assert.match(output(renderer), /Request access/);

  await act(async () => {
    await refreshHome();
    await Promise.resolve();
  });

  assert.ok(button(renderer.root, "Open app"));
  assert.ok(button(renderer.root, "Remove"));
  assert.doesNotMatch(output(renderer), /Request access/);
  await act(async () => renderer.unmount());
});

test("detail refresh hides all stale capabilities as soon as home status changes", async () => {
  memory.clear();
  const before = homeApp("active", "not_installed");
  const after = homeApp("pending", "installed");
  const capabilityRefresh = deferred();
  let detailCalls = 0;
  const client = {
    async getStoreAppDetail() {
      detailCalls += 1;
      if (detailCalls === 1) {
        return detail("active", "not_installed", ["install", "request_access", "submit_ticket"]);
      }
      if (detailCalls === 2) return capabilityRefresh.promise;
      return detail("active", "installed", ["open", "uninstall", "submit_ticket"]);
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
  assert.ok(button(renderer.root, "Install"));
  assert.ok(button(renderer.root, "Request access"));
  assert.ok(button(renderer.root, "Submit ticket"));

  await act(async () => {
    await refreshHome();
    await Promise.resolve();
  });

  const staleActionsVisible = ["Install", "Request access", "Submit ticket"].filter((label) =>
    Boolean(button(renderer.root, label))
  );
  const refreshingView = output(renderer);
  assert.ok(detailCalls >= 2);
  await act(async () => {
    capabilityRefresh.reject(new Error("capability refresh offline"));
    await Promise.resolve();
  });
  const failedView = output(renderer);
  const retry = button(renderer.root, "Retry current actions");
  assert.ok(retry);
  await act(async () => {
    retry.props.onClick();
    await Promise.resolve();
  });
  assert.ok(button(renderer.root, "Open app"));
  assert.ok(button(renderer.root, "Remove"));
  await act(async () => renderer.unmount());
  assert.deepEqual(staleActionsVisible, []);
  assert.match(refreshingView, /Refreshing current app actions/);
  assert.match(failedView, /Current app actions unavailable/);
  assert.match(failedView, /capability refresh offline/);
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
        { store: createStore(homeApp("active", "not_installed"), []), client },
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
  const returnButton = button(renderer.root, "Return to Apps");
  assert.ok(returnButton);
  await act(async () => returnButton.props.onClick());
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
