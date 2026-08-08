import assert from "node:assert/strict";
import test from "node:test";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const memory = new Map();

globalThis.window = {
  location: { pathname: "/store/search", href: "http://localhost/store/search" },
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
const { StoreSearchPage } = await import("./pages/StoreSearchPage.tsx");
const { StoreCollectionPage } = await import("./pages/StoreCollectionPage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

const app = (id, accessStatus, installStatus) => ({
  id,
  slug: id,
  name: `${id} App`,
  description: `${id} workflow`,
  owner: `${id} Team`,
  myRole: accessStatus === "active" ? "member" : undefined,
  accessStatus,
  installStatus,
  health: "healthy"
});

const alpha = app("Alpha", "active", "installed");
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
  return JSON.stringify(renderer.toJSON());
}

function select(renderer, name) {
  return renderer.root.findByProps({ name });
}

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

test("opening a Store card does not add recently opened history", async () => {
  memory.clear();
  const store = createStore();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store, client: {} },
        React.createElement(StoreCollectionPage, { page: "my-apps" })
      )
    );
  });

  const alphaCard = renderer.root.findAllByProps({
    className: "store-collection-main"
  })[0];
  assert.ok(alphaCard);
  await act(async () => {
    alphaCard.props.onClick();
  });

  assert.equal(window.location.pathname, "/store/apps/Alpha");
  assert.deepEqual(store.getSnapshot().device.recent, []);

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
