import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(
        new URL(`../../apps/app-store-pwa/src/${specifier.slice(2)}`, import.meta.url).href,
        context
      );
    }
    return nextResolve(specifier, context);
  }
});

const source = (file) => readFileSync(file, "utf8");
const apiClient = source("packages/api-client/src/index.ts");
const provider = source("apps/app-store-pwa/src/features/storefront/StoreProvider.tsx");
const shell = source("apps/app-store-pwa/src/features/storefront/StoreShell.tsx");
const composition = source("apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx");
const detail = source("apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx");
const detailStates = source(
  "apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailStates.tsx"
);
const collection = source(
  "apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx"
);
const tickets = source("apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx");
const ticketDetail = source(
  "apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx"
);
const routes = source("apps/app-store-pwa/src/routes/StoreRoutes.tsx");
const routeResolver = source("apps/app-store-pwa/src/routes/store-route.ts");

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;

globalThis.window = {
  location: { pathname: "/store/", search: "", href: "http://localhost/store/" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  history: { pushState() {}, replaceState() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {}
};
globalThis.document = { querySelector: () => null, title: "Horizon Store" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storeRequire = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
globalThis.React = (await import(storeRequire.resolve("react"))).default;

const { act, create } = await import(storeRequire.resolve("react-test-renderer"));
const { StoreProvider } =
  await import("../../apps/app-store-pwa/src/features/storefront/StoreProvider.tsx");
const { StoreShell } =
  await import("../../apps/app-store-pwa/src/features/storefront/StoreShell.tsx");
const { StoreCollectionPage } =
  await import("../../apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx");
const { StoreAppDetailPage } =
  await import("../../apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx");
const { StoreNotFoundPage } =
  await import("../../apps/app-store-pwa/src/features/storefront/pages/StoreNotFoundPage.tsx");
const { createStorefrontStateStore } =
  await import("../../apps/app-store-pwa/src/features/storefront/store-state.ts");

const emptyDevice = {
  version: 1,
  favorites: [],
  recent: [],
  ticketIds: [],
  accessReceipts: []
};

function readyBootstrap() {
  return {
    status: "ready",
    userName: "Task 8 User",
    email: "task8@example.com",
    role: "end_user",
    source: "Platform API",
    myApps: [],
    availableApps: []
  };
}

function stateStore(initialBootstrap) {
  return createStorefrontStateStore({
    initialBootstrap,
    loadHome: async () => initialBootstrap,
    device: {
      read: () => emptyDevice,
      toggleFavorite() {},
      recordRecent() {},
      rememberTicket() {},
      rememberAccessReceipt() {},
      clear: () => true
    },
    onLogoutSuccess: () => undefined
  });
}

const unavailableClient = {
  getStoreAppDetail: async () => {
    throw new Error("detail offline");
  },
  getStoreTicket: async () => {
    throw new Error("ticket offline");
  }
};

test("rendered Store states retain the workspace shell and a valid next action", async () => {
  const cases = [
    {
      name: "ready",
      bootstrap: readyBootstrap(),
      route: { page: "my-apps" },
      child: React.createElement("p", null, "Ready workspace content"),
      expected: [/Ready workspace content/, /Horizon Store/, /Task 8 User/]
    },
    {
      name: "empty",
      bootstrap: readyBootstrap(),
      route: { page: "my-apps" },
      child: React.createElement(StoreCollectionPage, { page: "my-apps" }),
      expected: [/No my apps yet/, /No applications are currently assigned/]
    },
    {
      name: "authentication error",
      bootstrap: { ...readyBootstrap(), status: "error", error: "Your session has ended." },
      route: { page: "my-apps" },
      child: null,
      expected: [/Sign-in required/, /Sign in with Keycloak/]
    },
    {
      name: "Platform error",
      bootstrap: { ...readyBootstrap(), status: "error", error: "Platform API unavailable" },
      route: { page: "my-apps" },
      child: null,
      expected: [/Store unavailable/, /Retry Store/]
    },
    {
      name: "detail error",
      bootstrap: readyBootstrap(),
      route: { page: "app-detail", appSlug: "payroll" },
      child: React.createElement(StoreAppDetailPage, { appSlug: "payroll" }),
      expected: [/App details/, /detail offline/, /Return to Apps/]
    },
    {
      name: "not found",
      bootstrap: readyBootstrap(),
      route: { page: "not-found" },
      child: React.createElement(StoreNotFoundPage),
      expected: [/Store page not found/, /Return to My Apps/]
    }
  ];

  for (const scenario of cases) {
    let renderer;
    await act(async () => {
      renderer = create(
        React.createElement(
          StoreProvider,
          { store: stateStore(scenario.bootstrap), client: unavailableClient },
          React.createElement(StoreShell, { route: scenario.route }, scenario.child)
        )
      );
      await Promise.resolve();
    });
    const main = renderer.root.findByType("main");
    const rendered = JSON.stringify(renderer.toJSON());
    assert.equal(main.props.className, "store-workspace", scenario.name);
    for (const pattern of scenario.expected) assert.match(rendered, pattern, scenario.name);
    assert.doesNotMatch(rendered, /Install app|Uninstall app/, scenario.name);
    await act(async () => renderer.unmount());
  }
});

test("App Store PWA actions are API-client backed through the scoped Provider coordinator", () => {
  for (const method of [
    "getStoreAppDetail",
    "requestStoreAccess",
    "submitStoreTicket",
    "getStoreTicket"
  ])
    assert.match(apiClient, new RegExp(`${method}\\(`));
  assert.match(provider, /runAppAction<T>/);
  assert.match(provider, /refreshHome\(\{ preserveReadyOnFailure: true \}\)/);
  for (const method of ["requestStoreAccess", "submitStoreTicket"]) {
    assert.match(detail, new RegExp(`api\\.${method}\\(app\\.slug`));
  }
  assert.match(detail, /runAppAction\(app\.slug/);
  assert.match(detail, /rememberAccessReceipt\(receipt\)/);
  assert.match(detail, /rememberTicket\(ticket\.id\)/);
  assert.doesNotMatch(detail, /api\.(?:installStoreApp|uninstallStoreApp)\(app\.slug/);
  assert.match(tickets, /api\.getStoreTicket\(ticketId\)/);
  assert.match(ticketDetail, /api\.getStoreTicket\(ticketId\)/);
  assert.doesNotMatch(detail, /ticketTimeline = \[/);
});

test("App Store PWA derives web app actions from access and fails Open closed", () => {
  assert.doesNotMatch(detailStates, /appInstallJourneySteps|installJourneyStatus/);
  assert.doesNotMatch(
    detail,
    /App install journey|Install on this account|Remove this installation/
  );
  assert.match(detailStates, /action === "open"/);
  assert.match(detailStates, /accessStatus === "active"/);
  assert.match(detailStates, /health === "healthy"/);
  assert.match(detailStates, /Boolean\(route\.trim\(\)\)/);
  assert.match(detail, /View status/);
});

test("App Store guards unauthenticated and empty states before access-action derivation", () => {
  const authGuard = shell.indexOf('if (bootstrap.status === "error")');
  assert.ok(authGuard >= 0);
  assert.ok(shell.indexOf("return (", authGuard) > authGuard);
  assert.match(shell, /authenticationError \? "Sign-in required" : "Store unavailable"/);
  assert.match(shell, /Retry Store/);
  assert.match(collection, /apps\.length\s*\?[^]*<StoreAppList apps=\{apps\}/);
  assert.match(collection, /No \$\{copy\.title\.toLocaleLowerCase\(\)\} yet/);
  const loadingGuard = detail.indexOf('detail.status === "loading"');
  const errorGuard = detail.indexOf('detail.status === "error"');
  const appDetail = detail.indexOf("const { app } = detail");
  const actionDerivation = detail.indexOf("const supports =");
  assert.ok(loadingGuard >= 0);
  assert.ok(errorGuard > loadingGuard);
  assert.ok(appDetail > errorGuard);
  assert.ok(actionDerivation > appDetail);
});

test("published app routing and Store detail Open compose into the generated runtime", () => {
  const caddyfile = source("docker/Caddyfile");
  assert.match(caddyfile, /handle \/apps\/\*/);
  assert.match(caddyfile, /rewrite \* \/store\{uri\}/);
  assert.match(caddyfile, /handle \/store\*/);
  assert.match(source("apps/creator-web/vite.config.ts"), /base: "\/creator\/"/);
  assert.match(source("apps/app-store-pwa/vite.config.ts"), /base: "\/store\/"/);
  assert.match(source("apps/app-store-pwa/index.html"), /href="manifest\.webmanifest"/);
  assert.match(caddyfile, /reverse_proxy app-store-pwa:4102/);
  assert.match(routes, /GeneratedLeaveManagementApp/);
  assert.match(routes, /pathname\.startsWith\("\/apps\/leave-management"\)/);
  assert.match(routeResolver, /segments\[2\] === "apps"/);
  assert.match(composition, /<StoreAppDetailPage appSlug=\{route\.appSlug\} \/>/);
  const recordRecent = detail.indexOf("recordRecent(app.slug)");
  const assignRuntime = detail.indexOf("window.location.assign(app.route)");
  assert.ok(recordRecent >= 0);
  assert.ok(assignRuntime > recordRecent);
  const generatedApp = source(
    "apps/app-store-pwa/src/features/generated-leave-management/GeneratedLeaveManagementApp.tsx"
  );
  for (const text of [
    "New leave request",
    "Submit request",
    "Approval queue",
    "approveRequest",
    "Last submitted request"
  ])
    assert.match(generatedApp, new RegExp(text));
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
