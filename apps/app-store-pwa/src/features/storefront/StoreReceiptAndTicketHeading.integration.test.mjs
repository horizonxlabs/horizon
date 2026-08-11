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
    pathname: "/store/tickets/ticket-1",
    href: "http://localhost/store/tickets/ticket-1"
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
const { StoreProvider } = await import("./StoreProvider.tsx");
const { StoreAccessRequestsPage } = await import("./pages/StoreAccessRequestsPage.tsx");
const { StoreTicketDetailPage } = await import("./pages/StoreTicketDetailPage.tsx");
const { createStorefrontStateStore } = await import("./store-state.ts");

function deferred() {
  let reject;
  const promise = new Promise((_resolve, nextReject) => {
    reject = nextReject;
  });
  return { promise, reject };
}

const activeApp = {
  id: "leave",
  slug: "leave-management",
  name: "Leave Management",
  description: "Leave requests",
  owner: "People",
  accessStatus: "active",
  installStatus: "installed",
  health: "healthy"
};
const ready = {
  status: "ready",
  userName: "End User",
  email: "user@example.com",
  source: "Platform API",
  myApps: [activeApp],
  availableApps: []
};
const receipt = (appSlug) => ({
  id: `receipt-${appSlug}`,
  appSlug,
  requestedRoleKey: "manager",
  requesterEmail: "user@example.com",
  status: "pending",
  reason: "Need approval",
  createdAt: "2026-07-29"
});

function createStore(receipts = []) {
  const device = createStoreDeviceState(window.localStorage);
  receipts
    .slice()
    .reverse()
    .forEach((item) => device.rememberAccessReceipt(item));
  return createStorefrontStateStore({
    initialBootstrap: ready,
    loadHome: async () => ready,
    device
  });
}

function output(renderer) {
  return JSON.stringify(renderer.toJSON());
}

function textContent(node) {
  if (typeof node === "string") return node;
  return node.children.map(textContent).join("");
}

function link(root, label) {
  return root.findAllByType("a").find((node) => node.children.join("").includes(label));
}

test("access receipt workspace distinguishes device receipt status from current API access status", async () => {
  memory.clear();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore([receipt("leave-management"), receipt("removed-app")]), client: {} },
        React.createElement(StoreAccessRequestsPage)
      )
    );
  });
  const view = output(renderer);
  assert.match(
    view,
    /Request receipts are stored on this device\. Current access reflects the latest Platform API catalog\./
  );
  assert.match(view, /Requested role/);
  assert.match(view, /Current access/);
  assert.match(view, /Device receipt status[^]*pending/);
  assert.match(view, /Current access[^]*active/);
  assert.match(view, /removed-app/);
  assert.match(view, /Current access unavailable/);
  const unavailableReceipt = renderer.root.findByProps({
    className: "store-history-card store-history-unavailable"
  });
  assert.doesNotMatch(textContent(unavailableReceipt), /Current access[^]*pending/);
  await act(async () => renderer.unmount());
});

test("profile workspace separates identity and device-local data", async () => {
  memory.clear();
  const { StoreProfilePage } = await import("./pages/StoreProfilePage.tsx");
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(), client: {} },
        React.createElement(StoreProfilePage)
      )
    );
  });
  const profileHtml = output(renderer);
  assert.match(profileHtml, /Identity and SSO/);
  assert.match(profileHtml, /Device-local data/);
  assert.match(profileHtml, /Clear device preferences/);
  await act(async () => renderer.unmount());
});

test("ticket detail loading and error states keep an h1 and safe Tickets return action", async () => {
  memory.clear();
  const pending = deferred();
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        { store: createStore(), client: { getStoreTicket: () => pending.promise } },
        React.createElement(StoreTicketDetailPage, { ticketId: "ticket-1" })
      )
    );
  });
  assert.equal(renderer.root.findByType("h1").children.join(""), "Ticket details");

  await act(async () => {
    pending.reject(new Error("ticket offline"));
    await Promise.resolve();
  });
  assert.equal(renderer.root.findByType("h1").children.join(""), "Ticket details");
  assert.match(output(renderer), /ticket offline/);
  const returnLink = link(renderer.root, "Return to Tickets");
  assert.ok(returnLink);
  assert.equal(returnLink.props.href, "/store/tickets");
  let prevented = false;
  await act(async () =>
    returnLink.props.onClick({
      preventDefault() {
        prevented = true;
      }
    })
  );
  assert.equal(prevented, true);
  assert.equal(window.location.pathname, "/store/tickets");
  await act(async () => renderer.unmount());
});

test("ticket detail not-found state uses a native Tickets return link", async () => {
  memory.clear();
  window.location.pathname = "/store/tickets/ticket-1";
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(
        StoreProvider,
        {
          store: createStore(),
          client: {
            getStoreTicket: async () => {
              throw new Error("404 not found");
            }
          }
        },
        React.createElement(StoreTicketDetailPage, { ticketId: "ticket-1" })
      )
    );
    await Promise.resolve();
  });
  assert.match(output(renderer), /Ticket not found/);
  const returnLink = link(renderer.root, "Return to Tickets");
  assert.ok(returnLink);
  assert.equal(returnLink.props.href, "/store/tickets");
  let prevented = false;
  await act(async () =>
    returnLink.props.onClick({
      preventDefault() {
        prevented = true;
      }
    })
  );
  assert.equal(prevented, true);
  assert.equal(window.location.pathname, "/store/tickets");
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
