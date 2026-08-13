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

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const memory = new Map();

globalThis.window = {
  location: {
    pathname: "/store/",
    search: "",
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
      const url = new URL(String(path), "http://localhost");
      window.location.pathname = url.pathname;
      window.location.search = url.search;
    },
    replaceState(_state, _title, path) {
      const url = new URL(String(path), "http://localhost");
      window.location.pathname = url.pathname;
      window.location.search = url.search;
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
const { StoreShell } = await import("./StoreShell.tsx");
const { StoreCollectionPage } = await import("./pages/StoreCollectionPage.tsx");
const { StoreProfilePage } = await import("./pages/StoreProfilePage.tsx");
const { StoreSearchPage } = await import("./pages/StoreSearchPage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

function deferred() {
  let reject;
  const promise = new Promise((_resolve, nextReject) => {
    reject = nextReject;
  });
  return { promise, reject };
}

const activeApp = {
  id: "active",
  slug: "active-app",
  name: "Active App",
  description: "Assigned workflow",
  owner: "People",
  route: "/apps/active",
  myRole: "member",
  accessStatus: "active",
  installStatus: "installed",
  health: "healthy"
};
const pendingApp = {
  ...activeApp,
  id: "pending",
  slug: "pending-app",
  name: "Pending App",
  route: undefined,
  myRole: undefined,
  accessStatus: "pending",
  installStatus: "not_installed"
};
const ready = {
  status: "ready",
  userName: "End User",
  email: "user@example.com",
  role: "end_user",
  source: "Platform API",
  myApps: [activeApp],
  availableApps: [pendingApp]
};

function createStore(bootstrap, loadHome = async () => bootstrap) {
  return createStorefrontStateStore({
    initialBootstrap: bootstrap,
    loadHome,
    device: createStoreDeviceState(window.localStorage)
  });
}

function collection(store, page) {
  return React.createElement(
    StoreProvider,
    { store, client: {} },
    React.createElement(StoreCollectionPage, { page })
  );
}

function workspace(store) {
  return React.createElement(
    StoreProvider,
    { store, client: {} },
    React.createElement(
      StoreShell,
      { route: { page: "my-apps" } },
      React.createElement(StoreCollectionPage, { page: "my-apps" })
    )
  );
}

function renderedText(node) {
  if (typeof node === "string") return node;
  return node.children.map(renderedText).join("");
}

test("bootstrap loading and errors keep non-sensitive workspace chrome around canvas recovery", async () => {
  const cases = [
    {
      name: "loading",
      bootstrap: { ...ready, status: "loading" },
      expected: /Loading Horizon Store/,
      status: /Connecting to Store services\./
    },
    {
      name: "authentication error",
      bootstrap: { ...ready, status: "error", error: "Your session has ended." },
      expected: /Sign in with Keycloak/,
      status: /Sign in to connect to Store services\./
    },
    {
      name: "Platform error",
      bootstrap: { ...ready, status: "error", error: "Platform API unavailable" },
      expected: /Retry Store/,
      status: /Store services are unavailable\./
    }
  ];

  for (const scenario of cases) {
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(
          StoreProvider,
          { store: createStore(scenario.bootstrap), client: {} },
          React.createElement(StoreShell, { route: { page: "profile" } }, null)
        )
      );
      await Promise.resolve();
    });
    assert.equal(
      renderer.root.findByType("main").props.className,
      "store-workspace",
      scenario.name
    );
    for (const className of ["store-workspace-frame", "store-topbar", "store-content-canvas"])
      assert.ok(renderer.root.findByProps({ className }), scenario.name);
    assert.ok(
      renderer.root.findByProps({ className: "store-sidebar store-sidebar-desktop" }),
      scenario.name
    );
    assert.equal(renderer.root.findAllByType("h1").length, 1, scenario.name);
    const view = JSON.stringify(renderer.toJSON());
    assert.match(view, /Horizon Store/, scenario.name);
    assert.match(view, /Workspace/, scenario.name);
    assert.match(view, /Search applications/, scenario.name);
    assert.match(view, /Profile/, scenario.name);
    assert.match(view, /Review identity and device-local Store data\./, scenario.name);
    assert.match(view, scenario.expected, scenario.name);
    assert.match(view, scenario.status, scenario.name);
    assert.doesNotMatch(view, /End User|user@example\.com|end user/, scenario.name);
    assert.doesNotMatch(
      view,
      /Store data is current|Previous Store data is still visible/,
      scenario.name
    );
    await act(async () => renderer.unmount());
  }
});

test("ready routes keep context in the topbar and one primary heading in route content", async () => {
  const cases = [
    {
      route: { page: "my-apps" },
      page: React.createElement(StoreCollectionPage, { page: "my-apps" }),
      title: "My Apps",
      description: "Launch applications assigned to your account."
    },
    {
      route: { page: "search" },
      page: React.createElement(StoreSearchPage),
      title: "Search",
      description: "Find applications by name, owner, team, or role."
    },
    {
      route: { page: "profile" },
      page: React.createElement(StoreProfilePage),
      title: "Profile",
      description: "Review identity and device-local Store data."
    }
  ];

  for (const scenario of cases) {
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(
          StoreProvider,
          { store: createStore(ready), client: {} },
          React.createElement(StoreShell, { route: scenario.route }, scenario.page)
        )
      );
      await Promise.resolve();
    });
    const topbar = renderer.root.findByProps({ className: "store-topbar" });
    const context = topbar.findByProps({ className: "store-topbar-context" });
    assert.match(renderedText(context), new RegExp(scenario.title));
    assert.match(renderedText(context), new RegExp(scenario.description.replaceAll(".", "\\.")));
    assert.doesNotMatch(renderedText(topbar), /End User|user@example\.com/);
    const sidebar = renderer.root.findByProps({
      className: "store-sidebar store-sidebar-desktop"
    });
    assert.ok(
      sidebar
        .findAllByType("a")
        .find((link) => link.props.className?.includes("store-sidebar-brand"))
    );
    const account = sidebar.findByProps({ className: "store-sidebar-account" });
    assert.match(renderedText(account), /End User/);
    assert.match(renderedText(account), /end user/);
    assert.equal(renderer.root.findAllByType("h1").length, 1, scenario.title);
    await act(async () => renderer.unmount());
  }
});

test("a recoverable refresh failure preserves content and warns that Platform API data is stale", async () => {
  memory.clear();
  const failedRefresh = deferred();
  let loads = 0;
  const store = createStore(ready, () => {
    loads += 1;
    return loads === 1 ? Promise.resolve(ready) : failedRefresh.promise;
  });
  let renderer;
  await act(async () => {
    renderer = create(workspace(store));
    await Promise.resolve();
  });
  const refresh = renderer.root
    .findByProps({ className: "store-topbar" })
    .findAllByType("button")
    .find((item) => item.children.join("") === "Refresh Store");
  assert.ok(refresh);
  await act(async () => refresh.props.onClick());
  await act(async () => {
    failedRefresh.reject(new Error("refresh offline"));
    await Promise.resolve();
  });

  const view = JSON.stringify(renderer.toJSON());
  assert.equal(store.getSnapshot().bootstrap.status, "ready");
  assert.match(view, /Active App/);
  assert.match(view, /Refresh failed\. Previous Store data is still visible\./);
  const warningBadge = renderer.root
    .findAllByType("span")
    .find((node) => node.children.join("") === "Platform API warning");
  assert.ok(warningBadge);
  assert.match(warningBadge.props.className, /bg-warning-bg/);
  assert.doesNotMatch(warningBadge.props.className, /bg-success-bg/);
  const alerts = renderer.root.findAllByProps({ role: "alert" });
  assert.equal(alerts.length, 1);
  assert.match(JSON.stringify(alerts[0].children), /refresh offline/);
  await act(async () => renderer.unmount());
});

test("an empty end-user catalog offers an in-panel Store refresh on every collection", async () => {
  for (const page of ["my-apps", "available", "favorites", "recent"]) {
    memory.clear();
    const emptyHome = { ...ready, myApps: [], availableApps: [] };
    let loads = 0;
    const store = createStore(emptyHome, async () => {
      loads += 1;
      return emptyHome;
    });
    let renderer;
    await act(async () => {
      renderer = create(collection(store, page));
      await Promise.resolve();
    });
    const panel = renderer.root.findByProps({
      className: "store-state-panel store-state-panel-neutral"
    });
    const refresh = panel
      .findAllByType("button")
      .find((item) => item.children.join("") === "Refresh Store");
    assert.ok(refresh, page);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Open Creator Workspace/, page);
    await act(async () => {
      refresh.props.onClick();
      await Promise.resolve();
    });
    assert.equal(loads, 2, page);
    await act(async () => renderer.unmount());
  }
});

test("collection empty states use native links for Store destinations", async () => {
  memory.clear();
  const cases = [
    {
      page: "my-apps",
      bootstrap: { ...ready, myApps: [], availableApps: [pendingApp] },
      label: "Browse Available Apps",
      href: "/store/available"
    },
    {
      page: "favorites",
      bootstrap: ready,
      label: "Browse Available Apps",
      href: "/store/available"
    },
    { page: "recent", bootstrap: ready, label: "View My Apps", href: "/store/" }
  ];

  for (const scenario of cases) {
    let renderer;
    await act(async () => {
      renderer = create(collection(createStore(scenario.bootstrap), scenario.page));
    });
    const action = renderer.root
      .findAllByType("a")
      .find((node) => node.children.join("") === scenario.label);
    assert.ok(action, scenario.page);
    assert.equal(action.props.href, scenario.href, scenario.page);
    let prevented = false;
    await act(async () =>
      action.props.onClick({
        preventDefault() {
          prevented = true;
        }
      })
    );
    assert.equal(prevented, true, scenario.page);
    assert.equal(window.location.pathname, scenario.href, scenario.page);
    await act(async () => renderer.unmount());
  }
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
