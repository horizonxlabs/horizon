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
const browserEvents = new EventTarget();
let historyEntries = ["/store/search"];
let historyIndex = 0;

function applyHistoryUrl(path) {
  const url = new URL(String(path), "http://localhost");
  window.location.pathname = url.pathname;
  window.location.search = url.search;
}

function resetHistory(path) {
  historyEntries = [path];
  historyIndex = 0;
  applyHistoryUrl(path);
}

globalThis.window = {
  location: {
    pathname: "/store/search",
    search: "",
    href: "http://localhost/store/search",
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
      historyEntries = historyEntries.slice(0, historyIndex + 1);
      historyEntries.push(String(path));
      historyIndex = historyEntries.length - 1;
      applyHistoryUrl(path);
    },
    replaceState(_state, _title, path) {
      historyEntries[historyIndex] = String(path);
      applyHistoryUrl(path);
    },
    back() {
      if (historyIndex === 0) return;
      historyIndex -= 1;
      applyHistoryUrl(historyEntries[historyIndex]);
      window.dispatchEvent(new Event("popstate"));
    },
    forward() {
      if (historyIndex >= historyEntries.length - 1) return;
      historyIndex += 1;
      applyHistoryUrl(historyEntries[historyIndex]);
      window.dispatchEvent(new Event("popstate"));
    }
  },
  addEventListener(...args) {
    browserEvents.addEventListener(...args);
  },
  removeEventListener(...args) {
    browserEvents.removeEventListener(...args);
  },
  dispatchEvent(event) {
    return browserEvents.dispatchEvent(event);
  }
};
globalThis.document = { querySelector: () => null, title: "Store" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;

const { act, create } = await import("react-test-renderer");
const { createStoreDeviceState } = await import("./device-state.ts");
const { StoreProvider } = await import("./StoreProvider.tsx");
const { StorefrontSummary } = await import("./StorefrontSummary.tsx");
const { StoreSearchPage } = await import("./pages/StoreSearchPage.tsx");
const { StoreCollectionPage } = await import("./pages/StoreCollectionPage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

const app = (id, accessStatus, installStatus) => ({
  id,
  slug: id,
  name: `${id} App`,
  description: `${id} workflow`,
  owner: `${id} Team`,
  route: accessStatus === "active" ? `/apps/${id}` : undefined,
  myRole: accessStatus === "active" ? "member" : undefined,
  accessStatus,
  installStatus,
  health: "healthy"
});

const alpha = app("Alpha", "active", "installed");
alpha.subdomain = "alpha";
alpha.subdomainUrl = "https://alpha.apps.example.com";
const beta = app("Beta", "active", "not_installed");
const gamma = app("Gamma", "pending", "not_installed");
const ready = {
  status: "ready",
  userName: "End User",
  email: "user@example.com",
  source: "Platform API",
  myApps: [alpha],
  availableApps: [beta, gamma]
};

function createStore() {
  return createStorefrontStateStore({
    initialBootstrap: ready,
    loadHome: async () => ready,
    device: createStoreDeviceState(window.localStorage)
  });
}

function text(renderer) {
  const values = [];
  const collect = (node) => {
    if (typeof node === "string") values.push(node);
    else if (Array.isArray(node)) node.forEach(collect);
    else if (node) collect(node.children);
  };
  collect(renderer.toJSON());
  return values.join("");
}

function select(renderer, name) {
  return renderer.root.findByProps({ name });
}

function searchWorkspace(store) {
  return React.createElement(
    StoreProvider,
    { store, client: {} },
    React.createElement(
      StorefrontSummary,
      {
        route: { page: "search" },
        userName: "End User",
        email: "user@example.com",
        role: "end_user",
        source: "Platform API",
        myAppsCount: 2,
        catalogCount: 3,
        requestCount: 0,
        ticketCount: 0,
        refreshPending: false,
        onRefresh() {},
        onLogout() {}
      },
      React.createElement(StoreSearchPage)
    )
  );
}

test("search initializes from q and clear filters resets the URL and controls", async () => {
  memory.clear();
  resetHistory("/store/search?q=Gamma");
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(), client: {} },
        React.createElement(StoreSearchPage)
      )
    );
  });
  assert.equal(renderer.root.findByProps({ name: "query" }).props.value, "Gamma");
  assert.match(text(renderer), /1 result/);
  assert.doesNotMatch(text(renderer), /Alpha App|Beta App/);
  const clear = renderer.root
    .findAllByType("button")
    .find((button) => button.children.join("") === "Clear filters");
  assert.ok(clear);
  await act(async () => clear.props.onClick());
  assert.equal(window.location.pathname, "/store/search");
  assert.equal(window.location.search, "");
  assert.equal(renderer.root.findByProps({ name: "query" }).props.value, "");
  assert.equal(select(renderer, "collection").props.value, "all");
  assert.equal(select(renderer, "accessStatus").props.value, "all");
  await act(async () => renderer.unmount());
});

test("same-path global search and query-only popstate resync the Search workspace", async (t) => {
  memory.clear();
  resetHistory("/store/search?q=Gamma");
  let renderer;
  t.after(async () => {
    if (renderer) await act(async () => renderer.unmount());
    window.location.search = "";
  });
  await act(async () => {
    renderer = create(searchWorkspace(createStore()));
  });

  const globalQuery = renderer.root.findByProps({ type: "search" });
  assert.equal(globalQuery.props.value, "Gamma");
  assert.equal(select(renderer, "query").props.value, "Gamma");
  assert.match(text(renderer), /Gamma App/);

  await act(async () => {
    globalQuery.props.onChange({ target: { value: "Alpha" } });
  });
  const globalSearch = renderer.root.findByProps({ className: "store-topbar-search" });
  await act(async () => {
    globalSearch.props.onSubmit({ preventDefault() {} });
  });

  assert.equal(window.location.pathname, "/store/search");
  assert.equal(window.location.search, "?q=Alpha");
  assert.equal(renderer.root.findByProps({ type: "search" }).props.value, "Alpha");
  assert.equal(select(renderer, "query").props.value, "Alpha");
  assert.match(text(renderer), /Alpha App/);
  assert.doesNotMatch(text(renderer), /Gamma App/);

  await act(async () => {
    window.history.back();
  });

  assert.equal(window.location.search, "?q=Gamma");
  assert.equal(renderer.root.findByProps({ type: "search" }).props.value, "Gamma");
  assert.equal(select(renderer, "query").props.value, "Gamma");
  assert.match(text(renderer), /Gamma App/);
  assert.doesNotMatch(text(renderer), /Alpha App|Beta App/);

  await act(async () => {
    window.history.forward();
  });

  assert.equal(window.location.search, "?q=Alpha");
  assert.equal(renderer.root.findByProps({ type: "search" }).props.value, "Alpha");
  assert.equal(select(renderer, "query").props.value, "Alpha");
  assert.match(text(renderer), /Alpha App/);
  assert.doesNotMatch(text(renderer), /Beta App|Gamma App/);
});

test("search exposes access filters without installation state", async () => {
  memory.clear();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(), client: {} },
        React.createElement(StoreSearchPage)
      )
    );
  });

  for (const label of ["Collection", "Access status"]) {
    const matchingLabel = renderer.root
      .findAllByType("label")
      .find((node) => node.findAllByType("span").some((span) => span.children.join("") === label));
    assert.ok(matchingLabel, `Expected an accessible ${label} label`);
  }
  assert.equal(select(renderer, "collection").props.value, "all");
  assert.equal(select(renderer, "accessStatus").props.value, "all");
  assert.equal(renderer.root.findAllByProps({ name: "installStatus" }).length, 0);
  assert.doesNotMatch(text(renderer), /Install status|Not installed/);

  await act(async () => {
    select(renderer, "collection").props.onChange({ target: { value: "available" } });
  });
  assert.match(text(renderer), /Gamma App/);
  assert.doesNotMatch(text(renderer), /Alpha App|Beta App/);

  await act(async () => {
    select(renderer, "collection").props.onChange({ target: { value: "all" } });
    select(renderer, "accessStatus").props.onChange({ target: { value: "active" } });
  });
  assert.match(text(renderer), /Alpha App/);
  assert.match(text(renderer), /Beta App/);
  assert.doesNotMatch(text(renderer), /Gamma App/);

  await act(async () => {
    select(renderer, "collection").props.onChange({ target: { value: "available" } });
    select(renderer, "accessStatus").props.onChange({ target: { value: "pending" } });
  });
  assert.match(text(renderer), /Gamma App/);
  assert.doesNotMatch(text(renderer), /Alpha App|Beta App/);

  await act(async () => {
    renderer.unmount();
  });
});

test("My Apps derives active access from the merged catalog", async () => {
  memory.clear();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(), client: {} },
        React.createElement(StoreCollectionPage, { page: "my-apps" })
      )
    );
  });

  assert.match(text(renderer), /Alpha App/);
  assert.match(text(renderer), /Beta App/);
  assert.doesNotMatch(text(renderer), /Gamma App/);

  await act(async () => {
    renderer.unmount();
  });
});

test("card detail navigation does not record history but opening an active app does", async () => {
  memory.clear();
  const store = createStore();
  let launchAuthorized = false;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        {
          store,
          client: {
            authorizeStoreAppLaunch: async (appSlug, routePath) => {
              assert.equal(appSlug, "Alpha");
              assert.equal(routePath, "/apps/Alpha");
              launchAuthorized = true;
              return {
                authorized: true,
                launchUrl: "https://alpha.apps.example.com/__launch/card-grant"
              };
            }
          }
        },
        React.createElement(StoreCollectionPage, { page: "my-apps" })
      )
    );
  });

  const accessUrl = renderer.root.findByProps({ className: "store-app-access-url-value" });
  assert.equal(accessUrl.children.join(""), "https://alpha.apps.example.com");
  assert.equal(accessUrl.props.title, "https://alpha.apps.example.com");

  const alphaCard = renderer.root.findAllByProps({ className: "store-app-detail-link" })[0];
  assert.ok(alphaCard);
  await act(async () => {
    alphaCard.props.onClick({ preventDefault() {} });
  });

  assert.equal(window.location.pathname, "/store/apps/Alpha");
  assert.deepEqual(store.getSnapshot().device.recent, []);

  const primary = renderer.root
    .findAllByProps({ className: "store-app-primary" })
    .find((node) => node.props.href === "/store/apps/Alpha");
  assert.ok(primary);
  await act(async () => {
    primary.props.onClick({ preventDefault() {} });
  });
  assert.equal(launchAuthorized, true);
  assert.equal(window.location.pathname, "https://alpha.apps.example.com/__launch/card-grant");
  assert.deepEqual(store.getSnapshot().device.recent, ["Alpha"]);

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
