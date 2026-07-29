import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalReact = globalThis.React;
globalThis.window = {
  location: { pathname: "/store/apps/first", hash: "", href: "http://localhost/store/apps/first", assign(path) { this.pathname = path; } },
  localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
  },
  history: { pushState() {}, replaceState() {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {}
};
globalThis.document = { querySelector: () => null, title: "Store" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;

const { act, create } = await import("react-test-renderer");
const { createStoreDeviceState } = await import("./device-state.ts");
const { StoreProvider, useStorefront } = await import("./StoreProvider.tsx");
const { StoreAppDetailPage } = await import("./pages/StoreAppDetailPage.tsx");
const { StoreShell } = await import("./StoreShell.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

const home = { status: "ready", userName: "End User", email: "user@example.com", source: "Platform API", myApps: [], availableApps: [] };
const detail = (slug = "first", actions = ["open", "install", "uninstall", "request_access", "submit_ticket"]) => ({
  id: slug, slug, name: `${slug} App`, description: "A supported app", ownerName: "IT", ownerUserId: "owner", department: "IT", accessMode: "role_based", releaseNotes: ["Ready"], supportContact: "help@example.com", actions,
  route: `/apps/${slug}`, accessStatus: "active", installStatus: "not_installed", health: "healthy", version: "1.0.0", lastUpdated: "2026-07-29", primaryAction: "open"
});

function createStore(loadHome = async () => home) {
  return createStorefrontStateStore({ initialBootstrap: home, loadHome, device: createStoreDeviceState(window.localStorage) });
}

function mount(store, client, slug = "first") {
  return create(React.createElement(StoreProvider, { store, client }, React.createElement(StoreAppDetailPage, { appSlug: slug })));
}

function IndependentRefresh() {
  const { refreshHome } = useStorefront();
  return React.createElement("button", { type: "button", onClick: () => void refreshHome() }, "Refresh independently");
}

function mountWithShell(store, client, slug = "first") {
  return create(
    React.createElement(
      StoreProvider,
      { store, client },
      React.createElement(
        StoreShell,
        { route: { page: "app-detail", appSlug: slug } },
        React.createElement(StoreAppDetailPage, { appSlug: slug }),
        React.createElement(IndependentRefresh)
      )
    )
  );
}

function button(root, label) {
  const item = root.findAllByType("button").find((node) => node.children.join("").includes(label));
  assert.ok(item, `Expected ${label} button`);
  return item;
}

test("detail ignores a stale app response after the route changes", async () => {
  const first = deferred();
  const second = deferred();
  const client = { getStoreAppDetail: (slug) => slug === "first" ? first.promise : second.promise };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client); });
  await act(async () => { renderer.update(React.createElement(StoreProvider, { store: createStore(), client }, React.createElement(StoreAppDetailPage, { appSlug: "second" }))); });
  await act(async () => { second.resolve(detail("second")); await Promise.resolve(); });
  await act(async () => { first.resolve(detail("first")); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /second App/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /first App/);
  await act(async () => { renderer.unmount(); });
});

test("detail deduplicates an action while allowing a different action", async () => {
  const install = deferred();
  const calls = { install: 0, access: 0 };
  const client = {
    getStoreAppDetail: async () => detail(),
    installStoreApp: () => { calls.install += 1; return install.promise; },
    requestStoreAccess: async () => { calls.access += 1; return { id: "receipt", appSlug: "first", requestedRoleKey: "member", requesterEmail: "user@example.com", status: "pending", reason: "Need it", createdAt: "2026-07-29" }; }
  };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client); await Promise.resolve(); });
  const installButton = button(renderer.root, "Install");
  await act(async () => { installButton.props.onClick(); installButton.props.onClick(); });
  const accessForm = renderer.root.findByProps({ "data-store-action": "request-access" });
  await act(async () => {
    const inputs = renderer.root.findAllByType("input");
    inputs.find((input) => input.props.name === "requestedRoleKey").props.onChange({ target: { value: "member" } });
    inputs.find((input) => input.props.name === "accessReason").props.onChange({ target: { value: "Need it" } });
  });
  await act(async () => { accessForm.props.onSubmit({ preventDefault() {} }); await Promise.resolve(); });
  assert.equal(calls.install, 1);
  assert.equal(calls.access, 1);
  await act(async () => { install.resolve({ id: "install", appSlug: "first", status: "active", installedAt: "2026-07-29" }); await Promise.resolve(); });
  await act(async () => { renderer.unmount(); });
});

test("install journey advances from validation through persisted completion", async () => {
  const install = deferred();
  const client = {
    getStoreAppDetail: async () => detail("journey", ["install"]),
    installStoreApp: () => install.promise
  };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client, "journey"); await Promise.resolve(); });
  const journey = () => renderer.root.findByProps({ "aria-label": "App install journey" });
  const statuses = () => journey().findAllByType("li").map((step) => step.props.className);
  assert.deepEqual(statuses(), [
    "store-install-step status-complete",
    "store-install-step status-current",
    "store-install-step status-pending",
    "store-install-step status-pending"
  ]);

  await act(async () => { button(renderer.root, "Install").props.onClick(); });
  assert.deepEqual(statuses(), [
    "store-install-step status-complete",
    "store-install-step status-current",
    "store-install-step status-current",
    "store-install-step status-pending"
  ]);

  await act(async () => {
    install.resolve({ id: "install", appSlug: "journey", status: "active", installedAt: "2026-07-29" });
    await Promise.resolve();
  });
  assert.deepEqual(statuses(), [
    "store-install-step status-complete",
    "store-install-step status-complete",
    "store-install-step status-complete",
    "store-install-step status-complete"
  ]);
  await act(async () => { renderer.unmount(); });
});

test("detail preserves a confirmed action when home refresh fails", async () => {
  const loads = [async () => home, async () => { throw new Error("refresh offline"); }];
  const client = { getStoreAppDetail: async () => detail(), installStoreApp: async () => ({ id: "install", appSlug: "first", status: "active", installedAt: "2026-07-29" }) };
  let renderer;
  await act(async () => { renderer = mount(createStore(() => loads.shift()()), client); await Promise.resolve(); });
  await act(async () => { button(renderer.root, "Install").props.onClick(); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /Install confirmed.*refresh failed/i);
  await act(async () => { renderer.unmount(); });
});

test("only the mutation refresh may preserve detail after failure; a later auth refresh requires sign-in", async () => {
  const loads = [
    async () => home,
    async () => { throw new Error("refresh offline"); },
    async () => { throw new Error("Your session has ended."); },
    async () => home
  ];
  const store = createStore(() => loads.shift()());
  const client = {
    getStoreAppDetail: async () => detail(),
    installStoreApp: async () => ({ id: "install", appSlug: "first", status: "active", installedAt: "2026-07-29" })
  };
  let renderer;
  await act(async () => { renderer = mountWithShell(store, client); await Promise.resolve(); });
  await act(async () => { button(renderer.root, "Install").props.onClick(); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /Install confirmed.*refresh failed/i);
  await act(async () => { button(renderer.root, "Refresh independently").props.onClick(); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /Sign-in required/);
  await act(async () => { await store.refresh(); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /first App/);
  await act(async () => { renderer.unmount(); });
});

test("detail renders an action error after its API call fails", async () => {
  const client = {
    getStoreAppDetail: async () => detail(),
    installStoreApp: async () => { throw new Error("installation unavailable"); }
  };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client); await Promise.resolve(); });
  await act(async () => { button(renderer.root, "Install").props.onClick(); await Promise.resolve(); });
  assert.match(JSON.stringify(renderer.toJSON()), /installation unavailable/);
  await act(async () => { renderer.unmount(); });
});

test("detail persists only returned access and ticket identifiers from rendered forms", async () => {
  const submitted = [];
  const client = {
    getStoreAppDetail: async () => detail(),
    requestStoreAccess: async (_slug, input) => ({ id: "receipt-1", appSlug: "first", requestedRoleKey: input.requestedRoleKey, requesterEmail: "user@example.com", status: "pending", reason: input.reason, department: input.department, createdAt: "2026-07-29" }),
    submitStoreTicket: async (_slug, input) => { submitted.push(input); return { id: "ticket-1", ticketNumber: "TKT-1", appSlug: "first", status: "submitted", timeline: [] }; }
  };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client); await Promise.resolve(); });
  const inputs = renderer.root.findAllByType("input");
  await act(async () => { inputs.find((input) => input.props.name === "requestedRoleKey").props.onChange({ target: { value: "member" } }); inputs.find((input) => input.props.name === "accessReason").props.onChange({ target: { value: "Need it" } }); });
  await act(async () => { renderer.root.findByProps({ "data-store-action": "request-access" }).props.onSubmit({ preventDefault() {} }); await Promise.resolve(); });
  const ticketInputs = renderer.root.findAllByType("input");
  await act(async () => { ticketInputs.find((input) => input.props.name === "ticketTitle").props.onChange({ target: { value: "  Broken flow  " } }); ticketInputs.find((input) => input.props.name === "ticketDescription").props.onChange({ target: { value: "  It fails  " } }); ticketInputs.find((input) => input.props.name === "ticketDevice").props.onChange({ target: { value: "  Safari  " } }); });
  await act(async () => { renderer.root.findByProps({ "data-store-action": "submit-ticket" }).props.onSubmit({ preventDefault() {} }); await Promise.resolve(); });
  assert.deepEqual(submitted[0], { type: "bug", priority: "medium", title: "Broken flow", description: "It fails", deviceInfo: "Safari" });
  assert.deepEqual(createStoreDeviceState(window.localStorage).read().ticketIds, ["ticket-1"]);
  assert.equal(createStoreDeviceState(window.localStorage).read().accessReceipts[0].id, "receipt-1");
  await act(async () => { renderer.unmount(); });
});

test("Open records recency before assigning the generated runtime route", async () => {
  const client = { getStoreAppDetail: async () => detail() };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client); await Promise.resolve(); });
  await act(async () => { button(renderer.root, "Open app").props.onClick(); });
  assert.equal(window.location.pathname, "/apps/first");
  assert.deepEqual(createStoreDeviceState(window.localStorage).read().recent, ["first"]);
  await act(async () => { renderer.unmount(); });
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
