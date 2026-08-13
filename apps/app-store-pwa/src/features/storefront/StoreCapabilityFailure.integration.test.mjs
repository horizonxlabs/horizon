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

function detailApp(accessStatus, actions) {
  return {
    ...homeApp(accessStatus),
    ownerName: "Platform",
    department: "IT",
    accessMode: "managed",
    availableRoles: ["manager"],
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

async function flushAction() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

test("legacy install capability cannot replace Open for active web access", async () => {
  memory.clear();
  const app = homeApp("active");
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        {
          store: storeWithFailingActionRefresh(app),
          client: {
            getStoreAppDetail: async () => detailApp("active", ["install", "uninstall"])
          }
        },
        React.createElement(StoreAppDetailPage, { appSlug: app.slug })
      )
    );
    await Promise.resolve();
  });

  assert.ok(button(renderer.root, "Open app"));
  assert.equal(button(renderer.root, "Install"), undefined);
  assert.equal(button(renderer.root, "Remove"), undefined);
  await act(async () => renderer.unmount());
});

test("confirmed access request hides duplicate request while keeping refresh failure visible", async () => {
  memory.clear();
  const app = homeApp("available");
  const client = {
    getStoreAppDetail: async () => detailApp("available", ["request_access"]),
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
      .findByProps({ name: "accessReason" })
      .props.onChange({ target: { value: "Need approval" } });
  });
  await act(async () => {
    renderer.root
      .findByProps({ "data-store-action": "request-access" })
      .props.onSubmit({ preventDefault() {} });
    await flushAction();
  });

  const view = JSON.stringify(renderer.toJSON());
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
