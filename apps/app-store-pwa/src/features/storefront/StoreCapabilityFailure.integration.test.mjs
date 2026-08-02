import assert from "node:assert/strict";
import test from "node:test";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const memory = new Map();

globalThis.window = {
  location: { pathname: "/store/apps/capability-app" },
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
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
const { StoreProvider } = await import("./StoreProvider.tsx");
const { StoreAppDetailPage } = await import("./pages/StoreAppDetailPage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

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

function detailApp(accessStatus, installStatus, actions) {
  return {
    ...homeApp(accessStatus, installStatus),
    ownerName: "Platform",
    department: "IT",
    accessMode: "managed",
    supportContact: "help@example.com",
    releaseNotes: [],
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

function storeWithFailingActionRefresh(app) {
  let loads = 0;
  return createStorefrontStateStore({
    initialBootstrap: ready(app),
    async loadHome() {
      loads += 1;
      if (loads === 1) return ready(app);
      throw new Error("home refresh offline");
    },
    device: createStoreDeviceState(window.localStorage)
  });
}

function button(root, label) {
  return root.findAllByType("button").find((node) => node.children.join("").includes(label));
}

function output(renderer) {
  return JSON.stringify(renderer.toJSON());
}

async function flushAction() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

test("confirmed install hides stale Install while keeping refresh failure visible", async () => {
  memory.clear();
  const app = homeApp("active", "not_installed");
  const client = {
    getStoreAppDetail: async () =>
      detailApp("active", "not_installed", ["install", "submit_ticket"]),
    installStoreApp: async () => ({
      id: "installation-1",
      appSlug: app.slug,
      status: "active",
      installedAt: "2026-07-29"
    })
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: storeWithFailingActionRefresh(app), client },
        React.createElement(StoreAppDetailPage, { appSlug: app.slug })
      )
    );
    await Promise.resolve();
  });

  await act(async () => {
    button(renderer.root, "Install").props.onClick();
    await flushAction();
  });

  const view = output(renderer);
  assert.equal(button(renderer.root, "Install"), undefined);
  assert.match(view, /Install confirmed/);
  assert.match(view, /Store home refresh failed: home refresh offline/);
  await act(async () => renderer.unmount());
});

test("confirmed access request hides duplicate request while keeping refresh failure visible", async () => {
  memory.clear();
  const app = homeApp("pending", "not_installed");
  const client = {
    getStoreAppDetail: async () => detailApp("pending", "not_installed", ["request_access"]),
    requestStoreAccess: async () => ({
      id: "receipt-1",
      appSlug: app.slug,
      requestedRoleKey: "manager",
      requesterEmail: "user@example.com",
      status: "pending",
      reason: "Need approval",
      createdAt: "2026-07-29"
    })
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: storeWithFailingActionRefresh(app), client },
        React.createElement(StoreAppDetailPage, { appSlug: app.slug })
      )
    );
    await Promise.resolve();
  });
  await act(async () => {
    renderer.root
      .findByProps({ name: "requestedRoleKey" })
      .props.onChange({ target: { value: "manager" } });
    renderer.root
      .findByProps({ name: "accessReason" })
      .props.onChange({ target: { value: "Need approval" } });
  });
  await act(async () => {
    renderer.root
      .findByProps({ "data-store-action": "request-access" })
      .props.onSubmit({ preventDefault() {} });
    await flushAction();
  });

  const view = output(renderer);
  assert.equal(button(renderer.root, "Request access"), undefined);
  assert.match(view, /Access request confirmed/);
  assert.match(view, /Store home refresh failed: home refresh offline/);
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
