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
globalThis.window = {
  location: {
    pathname: "/store/apps/role-aware",
    hash: "",
    href: "http://localhost/store/apps/role-aware"
  },
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
  },
  history: { pushState() {}, replaceState() {} },
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

test("access request offers API-provided app roles instead of requiring a guessed role key", async () => {
  const app = {
    id: "role-aware",
    appId: "role-aware",
    projectId: "project",
    slug: "role-aware",
    name: "Role-aware App",
    description: "A supported app",
    ownerName: "Sales Ops",
    ownerUserId: "owner",
    department: "Sales",
    accessMode: "role_based",
    releaseNotes: ["Ready"],
    supportContact: "owner@example.com",
    actions: ["request_access"],
    route: "/apps/role-aware",
    accessStatus: "available",
    installStatus: "not_installed",
    health: "healthy",
    version: "1.0.0",
    lastUpdated: "2026-07-29",
    primaryAction: "request_access",
    availableRoles: ["sales_rep", "sales_manager"]
  };
  const home = { status: "ready", source: "Platform API", myApps: [], availableApps: [] };
  const store = createStorefrontStateStore({
    initialBootstrap: home,
    loadHome: async () => home,
    device: createStoreDeviceState(window.localStorage)
  });
  let requested;
  const client = {
    getStoreAppDetail: async () => app,
    requestStoreAccess: async (_slug, input) => {
      requested = input;
      return {
        id: "receipt",
        appSlug: app.slug,
        requestedRoleKey: input.requestedRoleKey,
        requesterEmail: "user@example.com",
        status: "pending",
        reason: input.reason,
        createdAt: "2026-07-29"
      };
    }
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store, client },
        React.createElement(StoreAppDetailPage, { appSlug: app.slug })
      )
    );
    await Promise.resolve();
  });
  const roleSelect = renderer.root.findByProps({ name: "requestedRoleKey" });
  assert.equal(roleSelect.type, "select");
  assert.equal(roleSelect.props.value, "sales_rep");
  await act(async () => {
    roleSelect.props.onChange({ target: { value: "sales_manager" } });
    renderer.root.findByProps({ name: "accessReason" }).props.onChange({
      target: { value: "Manage regional pipeline" }
    });
  });
  await act(async () => {
    renderer.root
      .findByProps({ "data-store-action": "request-access" })
      .props.onSubmit({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.deepEqual(requested, {
    requestedRoleKey: "sales_manager",
    reason: "Manage regional pipeline"
  });
  await act(async () => {
    renderer.unmount();
  });

  let invalidRequests = 0;
  const noRoleApp = { ...app, slug: "no-role", availableRoles: [] };
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        {
          store,
          client: {
            getStoreAppDetail: async () => noRoleApp,
            requestStoreAccess: async () => {
              invalidRequests += 1;
            }
          }
        },
        React.createElement(StoreAppDetailPage, { appSlug: noRoleApp.slug })
      )
    );
    await Promise.resolve();
  });
  await act(async () => {
    renderer.root
      .findByProps({ "data-store-action": "request-access" })
      .props.onSubmit({ preventDefault() {} });
  });
  assert.equal(invalidRequests, 0);
  assert.match(JSON.stringify(renderer.toJSON()), /A requested role and reason are required/);
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
