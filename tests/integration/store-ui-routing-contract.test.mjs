import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(file, "utf8");
const apiClient = source("packages/api-client/src/index.ts");
const provider = source("apps/app-store-pwa/src/features/storefront/StoreProvider.tsx");
const shell = source("apps/app-store-pwa/src/features/storefront/StoreShell.tsx");
const composition = source("apps/app-store-pwa/src/features/storefront/StorefrontApp.tsx");
const detail = source("apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx");
const collection = source("apps/app-store-pwa/src/features/storefront/pages/StoreCollectionPage.tsx");
const tickets = source("apps/app-store-pwa/src/features/storefront/pages/StoreTicketsPage.tsx");
const ticketDetail = source("apps/app-store-pwa/src/features/storefront/pages/StoreTicketDetailPage.tsx");
const journey = source("apps/app-store-pwa/src/features/installations/index.ts");
const routes = source("apps/app-store-pwa/src/routes/StoreRoutes.tsx");
const routeResolver = source("apps/app-store-pwa/src/routes/store-route.ts");

test("App Store PWA actions are API-client backed through the scoped Provider coordinator", () => {
  for (const method of [
    "getStoreAppDetail",
    "requestStoreAccess",
    "installStoreApp",
    "uninstallStoreApp",
    "submitStoreTicket",
    "getStoreTicket"
  ]) assert.match(apiClient, new RegExp(`${method}\\(`));
  assert.match(provider, /runAppAction<T>/);
  assert.match(provider, /refreshHome\(\{ preserveReadyOnFailure: true \}\)/);
  for (const method of ["requestStoreAccess", "installStoreApp", "uninstallStoreApp", "submitStoreTicket"]) {
    assert.match(detail, new RegExp(`api\\.${method}\\(app\\.slug`));
  }
  assert.match(detail, /runAppAction\(app\.slug/);
  assert.match(detail, /rememberAccessReceipt\(receipt\)/);
  assert.match(detail, /rememberTicket\(ticket\.id\)/);
  assert.match(tickets, /api\.getStoreTicket\(ticketId\)/);
  assert.match(ticketDetail, /api\.getStoreTicket\(ticketId\)/);
  assert.doesNotMatch(detail, /ticketTimeline = \[/);
});

test("App Store PWA derives a visible install journey from API and scoped action state", () => {
  assert.match(detail, /appInstallJourneySteps/);
  assert.match(detail, /installJourneyStatus/);
  assert.match(detail, /aria-label="App install journey"/);
  for (const label of ["Access Check", "Manifest Validation", "Install Record", "My Apps Ready"]) {
    assert.match(journey, new RegExp(label));
  }
  assert.match(detail, /store-install-stepper/);
  assert.match(detail, /store-install-step status-/);
  assert.match(detail, /installActionState\?\.installationStatus/);
  assert.match(detail, /installActionState\?\.pending/);
  assert.match(journey, /installationStatus === "active"/);
  assert.match(source("docs/operations/real-mvp-persistence.md"), /App Install Journey/);
});

test("App Store guards unauthenticated and empty states before install-detail derivation", () => {
  const authGuard = shell.indexOf('if (bootstrap.status === "error")');
  assert.ok(authGuard >= 0);
  assert.ok(shell.indexOf("return (", authGuard) > authGuard);
  assert.match(shell, /title="Sign-in required"/);
  assert.match(collection, /apps\.length \? <StoreAppList/);
  assert.match(collection, /No \$\{copy\.title\.toLocaleLowerCase\(\)\} yet/);
  const loadingGuard = detail.indexOf('detail.status === "loading"');
  const errorGuard = detail.indexOf('detail.status === "error"');
  const appDetail = detail.indexOf("const { app } = detail");
  const journeyDerivation = detail.indexOf("const installJourneyRows = appInstallJourneySteps.map");
  assert.ok(loadingGuard >= 0);
  assert.ok(errorGuard > loadingGuard);
  assert.ok(appDetail > errorGuard);
  assert.ok(journeyDerivation > appDetail);
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
  const assignRuntime = detail.indexOf("window.location.assign(app.route || `/apps/${app.slug}`)");
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
  ]) assert.match(generatedApp, new RegExp(text));
});
