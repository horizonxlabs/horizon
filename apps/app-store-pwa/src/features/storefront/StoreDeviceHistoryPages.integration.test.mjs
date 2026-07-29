import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalReact = globalThis.React;
globalThis.window = {
  location: { pathname: "/store/tickets", href: "http://localhost/store/tickets" },
  localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) },
  history: { pushState() {}, replaceState() {} }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}
};
globalThis.document = { querySelector: () => null, title: "Store" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;

const { act, create } = await import("react-test-renderer");
const { createStoreDeviceState } = await import("./device-state.ts");
const { StoreProvider } = await import("./StoreProvider.tsx");
const { StoreAccessRequestsPage } = await import("./pages/StoreAccessRequestsPage.tsx");
const { StoreTicketsPage } = await import("./pages/StoreTicketsPage.tsx");
const { StoreTicketDetailPage } = await import("./pages/StoreTicketDetailPage.tsx");
const { StoreProfilePage } = await import("./pages/StoreProfilePage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

function deferred() { let resolve; const promise = new Promise((nextResolve) => { resolve = nextResolve; }); return { promise, resolve }; }
const app = { id: "leave", slug: "leave-management", name: "Leave Management", description: "Leave requests", owner: "People", accessStatus: "active", installStatus: "installed", health: "healthy" };
const ready = { status: "ready", userName: "End User", email: "user@example.com", source: "Platform API", myApps: [app], availableApps: [] };
function ticket(id, number = id.toUpperCase()) { return { id, ticketNumber: number, appSlug: "leave-management", appName: "Leave Management", title: `Title ${id}`, status: "submitted", timeline: [{ id: `${id}-event`, status: "submitted", label: "Submitted", occurredAt: "2026-07-29" }] }; }
function createStore({ ticketIds = [], receipts = [], storage = window.localStorage } = {}) {
  const device = createStoreDeviceState(storage);
  ticketIds.slice().reverse().forEach((id) => device.rememberTicket(id));
  receipts.slice().reverse().forEach((receipt) => device.rememberAccessReceipt(receipt));
  return createStorefrontStateStore({ initialBootstrap: ready, loadHome: async () => ready, device });
}
function mount(store, client, child) { return create(React.createElement(StoreProvider, { store, client }, child)); }
function output(renderer) { return JSON.stringify(renderer.toJSON()); }

test("ticket history preserves device order and mixed API outcomes", async () => {
  memory.clear();
  const calls = [];
  const client = { getStoreTicket: async (id) => { calls.push(id); if (id === "missing") throw new Error("Ticket unavailable"); return ticket(id, id === "first" ? "TKT-1" : "TKT-2"); } };
  let renderer;
  await act(async () => { renderer = mount(createStore({ ticketIds: ["first", "missing", "last"] }), client, React.createElement(StoreTicketsPage)); await Promise.resolve(); });
  const view = output(renderer);
  assert.deepEqual(calls, ["first", "missing", "last"]);
  assert.match(view, /Stored on this device/);
  assert.ok(view.indexOf("TKT-1") < view.indexOf("Ticket unavailable"));
  assert.ok(view.indexOf("Ticket unavailable") < view.indexOf("TKT-2"));
  await act(async () => { renderer.unmount(); });
});

test("ticket history does not duplicate an in-flight reload", async () => {
  memory.clear();
  const pending = deferred(); let calls = 0;
  const client = { getStoreTicket: () => { calls += 1; return pending.promise; } };
  let renderer;
  await act(async () => { renderer = mount(createStore({ ticketIds: ["one"] }), client, React.createElement(StoreTicketsPage)); });
  const reload = renderer.root.findAllByType("button").find((item) => item.children.join("").includes("Reload ticket history"));
  await act(async () => { reload.props.onClick(); });
  assert.equal(calls, 1);
  await act(async () => { pending.resolve(ticket("one", "TKT-ONE")); await Promise.resolve(); });
  await act(async () => { renderer.unmount(); });
});

test("ticket detail suppresses stale data and disables unsupported controls", async () => {
  memory.clear();
  const first = deferred(); const second = deferred();
  const client = { getStoreTicket: (id) => id === "first" ? first.promise : second.promise };
  let renderer;
  await act(async () => { renderer = mount(createStore(), client, React.createElement(StoreTicketDetailPage, { ticketId: "first" })); });
  await act(async () => { renderer.update(React.createElement(StoreProvider, { store: createStore(), client }, React.createElement(StoreTicketDetailPage, { ticketId: "second" }))); });
  await act(async () => { second.resolve(ticket("second", "TKT-SECOND")); await Promise.resolve(); });
  await act(async () => { first.resolve(ticket("first", "TKT-FIRST")); await Promise.resolve(); });
  assert.match(output(renderer), /TKT-SECOND/); assert.doesNotMatch(output(renderer), /TKT-FIRST/);
  assert.ok(renderer.root.findAllByType("button").filter((item) => item.props["aria-disabled"] === "true").length >= 2);
  assert.match(output(renderer), /Platform API support required/);
  await act(async () => { renderer.unmount(); });
});

test("access receipts retain unmatched apps and clearing device preferences keeps the session ready", async () => {
  memory.clear();
  const receipt = { id: "receipt-1", appSlug: "removed-app", requestedRoleKey: "manager", requesterEmail: "user@example.com", status: "pending", reason: "Need approval", createdAt: "2026-07-29" };
  const store = createStore({ ticketIds: ["ticket-1"], receipts: [receipt] });
  const client = { getStoreTicket: async () => ticket("ticket-1", "TKT-1") };
  let renderer;
  await act(async () => { renderer = mount(store, client, React.createElement(StoreAccessRequestsPage)); });
  assert.match(output(renderer), /removed-app/); assert.match(output(renderer), /not available in the current catalog/i);
  await act(async () => { renderer.update(React.createElement(StoreProvider, { store, client }, React.createElement(StoreProfilePage))); });
  const clear = renderer.root.findAllByType("button").find((item) => item.children.join("").includes("Clear device preferences"));
  await act(async () => { clear.props.onClick(); });
  const confirm = renderer.root.findAllByType("button").find((item) => item.children.join("").includes("Confirm clear"));
  await act(async () => { confirm.props.onClick(); });
  assert.match(output(renderer), /Device preferences cleared/); assert.equal(store.getSnapshot().bootstrap.status, "ready"); assert.deepEqual(store.getSnapshot().device.ticketIds, []);
  await act(async () => { renderer.update(React.createElement(StoreProvider, { store, client }, React.createElement(StoreTicketsPage))); await Promise.resolve(); });
  assert.match(output(renderer), /No ticket history on this device/);
  await act(async () => { renderer.unmount(); });
});

test("profile reports unavailable storage without clearing the ready session", async () => {
  memory.clear();
  const storage = { getItem: () => null, setItem() {}, removeItem() { throw new Error("storage blocked"); } };
  const store = createStore({ storage });
  let renderer;
  await act(async () => { renderer = mount(store, { getStoreTicket: async () => ticket("ticket") }, React.createElement(StoreProfilePage)); });
  const clear = renderer.root.findAllByType("button").find((item) => item.children.join("").includes("Clear device preferences"));
  await act(async () => { clear.props.onClick(); });
  const confirm = renderer.root.findAllByType("button").find((item) => item.children.join("").includes("Confirm clear"));
  await act(async () => { confirm.props.onClick(); });
  assert.match(output(renderer), /Device storage is unavailable/); assert.equal(store.getSnapshot().bootstrap.status, "ready");
  await act(async () => { renderer.unmount(); });
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalReact === undefined) delete globalThis.React; else globalThis.React = originalReact;
});
