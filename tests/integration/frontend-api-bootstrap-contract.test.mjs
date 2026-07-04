import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const apiClient = readFileSync("packages/api-client/src/index.ts", "utf8");
const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");
const creatorSource = readFileSync("apps/creator-web/src/main.tsx", "utf8");
const storeSource = readFileSync("apps/app-store-pwa/src/main.tsx", "utf8");

test("shared API client exposes frontend bootstrap routes and auth modes", () => {
  assert.match(apiClient, /class PlatformApiClient/);
  assert.match(apiClient, /getCurrentUser\(\)/);
  assert.match(apiClient, /listProjects\(\)/);
  assert.match(apiClient, /listStoreApps\(\)/);
  assert.match(apiClient, /runInstallerPreflight\(/);
  assert.match(apiClient, /saveInstallerSetup\(/);
  assert.match(apiClient, /listInstallerReports\(/);
  assert.match(apiClient, /testAiProvider\(/);
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

test("frontend shells use API-backed bootstrap instead of direct mock fixtures", () => {
  for (const source of [adminSource, creatorSource, storeSource]) {
    assert.doesNotMatch(source, /@evcp\/mock-data/);
    assert.match(source, /createPlatformApiClient/);
    assert.match(source, /platformSessionToken/);
    assert.match(source, /local fallback/);
  }

  assert.match(adminSource, /loadAdminBootstrap/);
  assert.match(creatorSource, /loadCreatorBootstrap/);
  assert.match(storeSource, /loadStoreBootstrap/);
});

test("frontend shells expose Platform Auth sign-in and logout bridge controls", () => {
  for (const source of [adminSource, creatorSource, storeSource]) {
    assert.match(source, /createPlatformSessionStore/);
    assert.match(source, /simulateSsoLogin/);
    assert.match(source, /Sign in/);
    assert.match(source, /Logout/);
  }

  assert.match(adminSource, /adminSessionBridgeProfile/);
  assert.match(creatorSource, /creatorSessionBridgeProfile/);
  assert.match(storeSource, /storeSessionBridgeProfile/);
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
  assert.match(apiClient, /submitStoreTicket\(/);
  assert.match(apiClient, /getStoreTicket\(/);
  assert.match(storeSource, /handleRequestAccess/);
  assert.match(storeSource, /handleSubmitTicket/);
  assert.match(storeSource, /requestStoreAccess/);
  assert.match(storeSource, /submitStoreTicket/);
  assert.match(storeSource, /getStoreTicket/);
  assert.match(storeSource, /accessRequestResult/);
  assert.match(storeSource, /ticketStatus/);
  assert.doesNotMatch(storeSource, /ticketTimeline = \[/);
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

  for (const handler of ["loadCreatorPublishState", "handleInviteUser", "handleApproveAccessRequest", "handlePublishProject"]) {
    assert.match(creatorSource, new RegExp(handler));
  }

  assert.match(creatorSource, /publishResult/);
  assert.match(creatorSource, /appAccessSnapshot/);
});
