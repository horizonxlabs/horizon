import assert from "node:assert/strict";
import test from "node:test";

const memory = new Map();
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalReact = globalThis.React;
globalThis.window = {
  location: {
    pathname: "/store/apps/first",
    hash: "",
    href: "http://localhost/store/apps/first",
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

const home = {
  status: "ready",
  userName: "End User",
  email: "user@example.com",
  source: "Platform API",
  myApps: [],
  availableApps: []
};
const detail = (slug = "first", actions = ["open", "submit_ticket"]) => ({
  id: slug,
  slug,
  name: `${slug} App`,
  description: "A supported app",
  ownerName: "IT",
  ownerUserId: "owner",
  department: "IT",
  accessMode: "role_based",
  availableRoles: ["member"],
  releaseNotes: ["Ready"],
  supportContact: "help@example.com",
  actions,
  route: `/apps/${slug}`,
  accessStatus: "active",
  installStatus: "not_installed",
  health: "healthy",
  version: "1.0.0",
  lastUpdated: "2026-07-29",
  primaryAction: "open"
});

function createStore(loadHome = async () => home) {
  return createStorefrontStateStore({
    initialBootstrap: home,
    loadHome,
    device: createStoreDeviceState(window.localStorage)
  });
}

function mount(store, client, slug = "first") {
  return create(
    React.createElement(
      StoreProvider,
      { store, client },
      React.createElement(StoreAppDetailPage, { appSlug: slug })
    )
  );
}

function button(root, label) {
  const item = root
    .findAllByType("button")
    .find((node) => node.children.join("").includes(label));
  assert.ok(item, `Expected ${label} button`);
  return item;
}

test("detail ignores a stale app response after the route changes", async () => {
  const first = deferred();
  const second = deferred();
  const client = {
    getStoreAppDetail: (slug) => (slug === "first" ? first.promise : second.promise)
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client);
  });
  await act(async () => {
    renderer.update(
      React.createElement(
        StoreProvider,
        { store: createStore(), client },
        React.createElement(StoreAppDetailPage, { appSlug: "second" })
      )
    );
  });
  await act(async () => {
    second.resolve(detail("second"));
    await Promise.resolve();
  });
  await act(async () => {
    first.resolve(detail("first"));
    await Promise.resolve();
  });
  assert.match(JSON.stringify(renderer.toJSON()), /second App/);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /first App/);
  await act(async () => {
    renderer.unmount();
  });
});

test("active access opens a healthy published web app without installation", async () => {
  const active = {
    ...detail("active", ["install", "uninstall"]),
    accessStatus: "active",
    installStatus: "not_installed"
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), { getStoreAppDetail: async () => active }, "active");
    await Promise.resolve();
  });
  assert.ok(button(renderer.root, "Open app"));
  const rendered = JSON.stringify(renderer.toJSON());
  assert.doesNotMatch(
    rendered,
    /App install journey|Install on this account|Remove this installation/
  );
  assert.equal(
    renderer.root
      .findAllByType("button")
      .some((item) => ["Install", "Remove"].includes(item.children.join(""))),
    false
  );
  await act(async () => {
    renderer.unmount();
  });
});

test("pending access links to request status without installation controls", async () => {
  const pending = {
    ...detail("pending", ["view_status", "install"]),
    accessStatus: "pending"
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), { getStoreAppDetail: async () => pending }, "pending");
    await Promise.resolve();
  });
  await act(async () => {
    button(renderer.root, "View status").props.onClick();
  });
  assert.equal(window.location.pathname, "/store/access-requests");
  assert.doesNotMatch(
    JSON.stringify(renderer.toJSON()),
    /App install journey|Install on this account/
  );
  await act(async () => {
    renderer.unmount();
  });
});

test("Open fails closed for an unhealthy app or missing published route", async () => {
  for (const unavailable of [
    { ...detail("unhealthy", ["open"]), health: "degraded" },
    { ...detail("missing-route", ["open"]), route: "" }
  ]) {
    let renderer;
    await act(async () => {
      renderer = mount(
        createStore(),
        { getStoreAppDetail: async () => unavailable },
        unavailable.slug
      );
      await Promise.resolve();
    });
    assert.equal(
      renderer.root
        .findAllByType("button")
        .some((item) => item.children.join("") === "Open app"),
      false
    );
    await act(async () => {
      renderer.unmount();
    });
  }
});

test("available access persists the returned access receipt", async () => {
  const available = {
    ...detail("available", ["request_access"]),
    accessStatus: "available",
    primaryAction: "request_access"
  };
  const client = {
    getStoreAppDetail: async () => available,
    requestStoreAccess: async (_slug, input) => ({
      id: "receipt-1",
      appSlug: "available",
      requestedRoleKey: input.requestedRoleKey,
      requesterEmail: "user@example.com",
      status: "pending",
      reason: input.reason,
      createdAt: "2026-07-29"
    })
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client, "available");
    await Promise.resolve();
  });
  const inputs = renderer.root.findAllByType("input");
  await act(async () => {
    inputs
      .find((input) => input.props.name === "accessReason")
      .props.onChange({ target: { value: "Need it" } });
  });
  await act(async () => {
    renderer.root
      .findByProps({ "data-store-action": "request-access" })
      .props.onSubmit({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.equal(createStoreDeviceState(window.localStorage).read().accessReceipts[0].id, "receipt-1");
  await act(async () => {
    renderer.unmount();
  });
});

test("active access persists only the returned ticket identifier", async () => {
  const submitted = [];
  const client = {
    getStoreAppDetail: async () => detail(),
    submitStoreTicket: async (_slug, input) => {
      submitted.push(input);
      return {
        id: "ticket-1",
        ticketNumber: "TKT-1",
        appSlug: "first",
        status: "submitted",
        timeline: []
      };
    }
  };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client);
    await Promise.resolve();
  });
  const inputs = renderer.root.findAllByType("input");
  await act(async () => {
    inputs
      .find((input) => input.props.name === "ticketTitle")
      .props.onChange({ target: { value: "  Broken flow  " } });
    inputs
      .find((input) => input.props.name === "ticketDescription")
      .props.onChange({ target: { value: "  It fails  " } });
    inputs
      .find((input) => input.props.name === "ticketDevice")
      .props.onChange({ target: { value: "  Safari  " } });
  });
  await act(async () => {
    renderer.root
      .findByProps({ "data-store-action": "submit-ticket" })
      .props.onSubmit({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.deepEqual(submitted[0], {
    type: "bug",
    priority: "medium",
    title: "Broken flow",
    description: "It fails",
    deviceInfo: "Safari"
  });
  assert.deepEqual(createStoreDeviceState(window.localStorage).read().ticketIds, ["ticket-1"]);
  await act(async () => {
    renderer.unmount();
  });
});

test("Open records recency before assigning the published runtime route", async () => {
  memory.clear();
  const client = { getStoreAppDetail: async () => detail() };
  let renderer;
  await act(async () => {
    renderer = mount(createStore(), client);
    await Promise.resolve();
  });
  await act(async () => {
    button(renderer.root, "Open app").props.onClick();
  });
  assert.equal(window.location.pathname, "/apps/first");
  assert.deepEqual(createStoreDeviceState(window.localStorage).read().recent, ["first"]);
  await act(async () => {
    renderer.unmount();
  });
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
