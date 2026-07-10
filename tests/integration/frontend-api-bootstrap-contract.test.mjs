import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readAllSourceFiles(dir) {
  const entries = readdirSync(dir);
  let combined = "";
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      combined += readAllSourceFiles(fullPath);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      combined += readFileSync(fullPath, "utf8");
    }
  }
  return combined;
}

const apiClient = readFileSync("packages/api-client/src/index.ts", "utf8");
const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const adminClientSource = readFileSync("apps/admin-web/src/admin-client.ts", "utf8");
// The creator-web CreatorApp component was split across hooks/, pages/, and
// components/ files as a pure restructure; concatenate the whole src tree so
// source-content assertions below still see every identifier/behavior.
const creatorSource = readAllSourceFiles("apps/creator-web/src");
const storeSource = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");
const uiStyles = readFileSync("packages/ui/styles.css", "utf8");
const appConfig = readFileSync("packages/config/src/index.ts", "utf8");
const persistenceDocs = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");
const caddyfile = readFileSync("docker/Caddyfile", "utf8");
const creatorViteConfig = readFileSync("apps/creator-web/vite.config.ts", "utf8");
const storeViteConfig = readFileSync("apps/app-store-pwa/vite.config.ts", "utf8");
const storeIndex = readFileSync("apps/app-store-pwa/index.html", "utf8");

test("shared API client exposes frontend bootstrap routes and auth modes", () => {
  assert.match(apiClient, /class PlatformApiClient/);
  assert.match(apiClient, /getCurrentUser\(\)/);
  assert.match(apiClient, /listProjects\(\)/);
  assert.match(apiClient, /listStoreApps\(\)/);
  assert.match(apiClient, /runInstallerPreflight\(/);
  assert.match(apiClient, /saveInstallerSetup\(/);
  assert.match(apiClient, /listInstallerReports\(/);
  assert.match(apiClient, /testAiProvider\(/);
  assert.match(apiClient, /listAiProviders\(/);
  assert.match(apiClient, /createAiProvider\(/);
  assert.match(apiClient, /createAiApiKey\(/);
  assert.match(apiClient, /configureAiRoute\(/);
  assert.match(apiClient, /configureAiQuota\(/);
  assert.match(apiClient, /createGuardrailRule\(/);
  assert.match(apiClient, /listGuardrailEvents\(/);
  assert.match(apiClient, /authorization/);
  assert.match(apiClient, /x-mock-user-email/);
  assert.match(apiClient, /PlatformApiError/);
});

test("Admin AI provider test call is API-client backed", () => {
  assert.match(apiClient, /AiProviderTestCallInput/);
  assert.match(apiClient, /AiProviderTestCallResponse/);
  assert.match(apiClient, /\/ai\/provider-test-call/);
  assert.match(adminSource, /handleRunProviderTestCall/);
  assert.match(adminSource, /testAiProvider/);
  assert.match(adminSource, /Provider Test Call/);
  assert.match(adminSource, /provider-test-call-panel/);
  assert.doesNotMatch(adminSource, /fetch\(`\$\{baseUrl\}\/ai\/provider-test-call`/);
});

test("Admin AI governance actions are API-client backed", () => {
  for (const method of [
    "listAiProviders",
    "listAiApiKeys",
    "createAiProvider",
    "createAiApiKey",
    "configureAiRoute",
    "configureAiQuota",
    "createGuardrailRule",
    "listGuardrailEvents"
  ]) {
    assert.match(apiClient, new RegExp(`${method}\\(`));
    assert.match(adminSource, new RegExp(method));
  }

  for (const handler of [
    "loadAiGovernanceState",
    "handleCreateAiProvider",
    "handleSaveAiApiKey",
    "handleConfigureAiRoute",
    "handleConfigureAiQuota",
    "handleCreateGuardrailRule"
  ]) {
    assert.match(adminSource, new RegExp(handler));
  }

  for (const label of [
    "Create Provider",
    "Save Masked Key",
    "Configure Route",
    "Configure Quota",
    "Add Guardrail Rule"
  ]) {
    assert.match(adminSource, new RegExp(label));
  }

  assert.match(adminSource, /aiGovernanceSource/);
  assert.match(adminSource, /setAiKeySecret\(""\)/);
  assert.doesNotMatch(adminSource, /fetch\(`\$\{baseUrl\}\/ai\/providers`/);
  assert.doesNotMatch(adminSource, /fetch\(`\$\{baseUrl\}\/guardrails\/rules`/);
});

test("frontend shells use API-backed bootstrap instead of direct mock fixtures", () => {
  for (const source of [adminSource, creatorSource, storeSource]) {
    assert.doesNotMatch(source, /@evcp\/mock-data/);
    assert.match(source, /createPlatformApiClient/);
    assert.match(source, /local fallback/);
  }

  // Admin delegates platform session-token handling to its extracted admin-client module.
  assert.match(adminClientSource, /platformSessionToken/);
  assert.match(creatorSource, /platformSessionToken/);
  assert.match(storeSource, /platformSessionToken/);

  assert.match(adminSource, /loadAdminBootstrap/);
  assert.match(creatorSource, /loadCreatorBootstrap/);
  assert.match(storeSource, /loadStoreBootstrap/);
});

test("frontend shells expose Platform Auth sign-in and logout bridge controls", () => {
  for (const source of [adminSource, creatorSource, storeSource]) {
    assert.match(source, /createPlatformSessionStore/);
    assert.match(source, /simulateSsoLogin/);
    assert.match(source, /Logout/);
  }
  // Admin and store keep a visible session sign-in/refresh control. The creator shell dropped its
  // "Demo Sign in" button (it uses native login + the automatic session bridge), keeping only logout.
  assert.match(adminSource, /Sign in|Refresh Session/);
  assert.match(storeSource, /Sign in|Refresh Session/);

  assert.match(adminSource, /adminSessionBridgeProfile/);
  assert.match(creatorSource, /creatorSessionBridgeProfile/);
  assert.match(storeSource, /storeSessionBridgeProfile/);
});

test("Admin and Creator shells render separate page branches instead of one combined evidence page", () => {
  assert.match(adminSource, /adminPageFromPath/);
  assert.match(adminSource, /renderAdminShell/);
  assert.match(adminSource, /adminPageCopy/);
  for (const branch of [
    'adminPage === "dashboard"',
    'adminPage === "services"',
    'adminPage === "ai-providers"',
    'adminPage === "guardrails"',
    'adminPage === "audit-logs"'
  ]) {
    assert.match(adminSource, new RegExp(branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(creatorSource, /creatorPageFromPath/);
  assert.match(creatorSource, /CreatorShell/);
  assert.match(creatorSource, /creatorPageCopy/);
  for (const branch of [
    'creatorPage === "projects"',
    'creatorPage === "workspace"',
    'creatorPage === "prd"',
    'creatorPage === "users"',
    'creatorPage === "publish"',
    'creatorPage === "tickets"'
  ]) {
    assert.match(creatorSource, new RegExp(branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(uiStyles, /\.admin-page-stack/);
  assert.match(caddyfile, /redir \/creator \/creator\/ 308/);
  assert.match(caddyfile, /redir \/store \/store\/ 308/);
  assert.match(appConfig, /route: "\/creator\/"/);
  assert.match(appConfig, /route: "\/store\/"/);
});

test("Admin install wizard is API-client backed and exposes step controls", () => {
  assert.match(adminSource, /runInstallerPreflight/);
  assert.match(adminSource, /saveInstallerSetup/);
  assert.match(adminSource, /handleWizardNext/);
  assert.match(adminSource, /handleWizardBack/);
  assert.match(adminSource, /handleSaveInstallerSetup/);
  assert.match(adminSource, /Save Setup/);
  assert.match(adminSource, /Next Step/);
  assert.match(adminSource, /Back/);
  assert.doesNotMatch(adminSource, /fetch\(`\$\{baseUrl\}\/admin\/installer\/preflight`/);
});

test("App Store PWA actions are API-client backed", () => {
  assert.match(apiClient, /getStoreAppDetail\(/);
  assert.match(apiClient, /requestStoreAccess\(/);
  assert.match(apiClient, /installStoreApp\(/);
  assert.match(apiClient, /uninstallStoreApp\(/);
  assert.match(apiClient, /submitStoreTicket\(/);
  assert.match(apiClient, /getStoreTicket\(/);
  assert.match(storeSource, /handleRequestAccess/);
  assert.match(storeSource, /handleInstallApp/);
  assert.match(storeSource, /handleUninstallApp/);
  assert.match(storeSource, /handleSubmitTicket/);
  assert.match(storeSource, /requestStoreAccess/);
  assert.match(storeSource, /installStoreApp/);
  assert.match(storeSource, /uninstallStoreApp/);
  assert.match(storeSource, /submitStoreTicket/);
  assert.match(storeSource, /getStoreTicket/);
  assert.match(storeSource, /accessRequestResult/);
  assert.match(storeSource, /installResult/);
  assert.match(storeSource, /ticketStatus/);
  assert.doesNotMatch(storeSource, /ticketTimeline = \[/);
});

test("App Store PWA exposes an install journey instead of a single opaque install action", () => {
  assert.match(storeSource, /appInstallJourneySteps/);
  assert.match(storeSource, /installJourneyStatus/);
  assert.match(storeSource, /aria-label="App install journey"/);
  for (const label of ["Access Check", "Manifest Validation", "Install Record", "My Apps Ready"]) {
    assert.match(storeSource, new RegExp(label));
  }
  assert.match(storeSource, /store-install-stepper/);
  assert.match(storeSource, /store-install-step status-/);
  assert.match(storeSource, /installResult\?\.status === "active"/);
  assert.match(persistenceDocs, /App Install Journey/);
});

test("published app route opens a usable generated Leave Management runtime", () => {
  assert.match(caddyfile, /handle \/apps\/\*/);
  assert.match(caddyfile, /rewrite \* \/store\{uri\}/);
  assert.match(caddyfile, /handle \/store\*/);
  assert.match(creatorViteConfig, /base: "\/creator\/"/);
  assert.match(storeViteConfig, /base: "\/store\/"/);
  assert.match(storeIndex, /href="manifest\.webmanifest"/);
  assert.match(caddyfile, /reverse_proxy app-store-pwa:4102/);
  assert.match(storeSource, /GeneratedLeaveManagementApp/);
  assert.match(storeSource, /currentPath\.startsWith\("\/apps\/leave-management"\)/);
  assert.match(storeSource, /handleOpenSelectedApp/);
  assert.match(
    storeSource,
    /window\.location\.assign\(selectedApp\.route \?\? `\/apps\/\$\{selectedApp\.slug\}`\)/
  );
  for (const text of [
    "New leave request",
    "Submit request",
    "Approval queue",
    "approveRequest",
    "Last submitted request"
  ]) {
    assert.match(storeSource, new RegExp(text));
  }
});

test("Creator workspace actions are API-client backed", () => {
  assert.match(apiClient, /getWorkspace\(/);
  assert.match(apiClient, /submitWorkspacePrompt\(/);
  assert.match(apiClient, /refreshWorkspacePreview\(/);
  assert.match(creatorSource, /createCreatorPlatformClient/);
  assert.match(creatorSource, /loadWorkspaceState/);
  assert.match(creatorSource, /handleSubmitPrompt/);
  assert.match(creatorSource, /handleRefreshPreview/);
  assert.match(creatorSource, /submitWorkspacePrompt/);
  assert.match(creatorSource, /refreshWorkspacePreview/);
  assert.match(creatorSource, /workspaceResult/);
  assert.doesNotMatch(creatorSource, /const taskSteps = \[/);
});

test("Creator project wizard creates a real project and generated PRD draft", () => {
  for (const method of ["createProject", "generatePrdDraft", "listPrdVersions", "getCurrentPrd"]) {
    assert.match(apiClient, new RegExp(`${method}\\(`));
    assert.match(creatorSource, new RegExp(method));
  }

  assert.match(creatorSource, /handleCreateProjectSubmit/);
  assert.match(creatorSource, /Create Project \+ Generate PRD/);
  assert.match(creatorSource, /client\.createProject/);
  assert.match(creatorSource, /client\.generatePrdDraft/);
  assert.match(creatorSource, /loadCreatorBootstrap\(project\.id\)/);
  assert.match(creatorSource, /setCurrentPrdVersion\(draft\)/);
  assert.match(creatorSource, /creator-project-dialog/);
  assert.match(creatorSource, /createCreatorNavigation/);
  assert.doesNotMatch(creatorSource, /navItems=\{navigation\.creator\}/);
});

test("Creator app users and publish actions are API-client backed", () => {
  for (const method of [
    "getAppAccessSnapshot",
    "createAppInvitation",
    "decideAppAccessRequest",
    "getPublishReview",
    "publishProject",
    "listAppStoreRegistry"
  ]) {
    assert.match(apiClient, new RegExp(`${method}\\(`));
    assert.match(creatorSource, new RegExp(method));
  }

  for (const handler of [
    "loadCreatorPublishState",
    "handleInviteUser",
    "handleApproveAccessRequest",
    "handlePublishProject"
  ]) {
    assert.match(creatorSource, new RegExp(handler));
  }

  assert.match(creatorSource, /publishResult/);
  assert.match(creatorSource, /appAccessSnapshot/);
});
