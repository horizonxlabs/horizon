import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
const adminAppSource = readFileSync("apps/admin-web/src/app/AdminApp.tsx", "utf8");
const adminRoutesSource = readFileSync("apps/admin-web/src/routes/AdminRoutes.tsx", "utf8");
const aiGovernanceHookSource = readFileSync(
  "apps/admin-web/src/features/ai-governance/use-ai-governance.ts",
  "utf8"
);
const adminClientSource = readFileSync("apps/admin-web/src/shared/platform-client.ts", "utf8");
const adminConsoleSource = readAllSourceFiles("apps/admin-web/src/features/admin-console");
const adminOperationsSource = readFileSync(
  "apps/admin-web/src/features/platform-operations/use-production-observability.ts",
  "utf8"
);
const adminAuditSource = readFileSync(
  "apps/admin-web/src/features/audit-monitoring/AuditEvidenceSection.tsx",
  "utf8"
);
const creatorTicketsSource = readFileSync(
  "apps/creator-web/src/features/tickets/TicketsPage.tsx",
  "utf8"
);
const creatorTicketInboxSource = readFileSync(
  "apps/creator-web/src/features/tickets/use-creator-ticket-inbox.ts",
  "utf8"
);
const creatorTicketActionsSource = readFileSync(
  "apps/creator-web/src/features/tickets/ticket-actions.ts",
  "utf8"
);
const creatorAppHookSource = readFileSync("apps/creator-web/src/app/use-creator-app.tsx", "utf8");
const creatorPublishPageSource = readFileSync(
  "apps/creator-web/src/features/publish/PublishPage.tsx",
  "utf8"
);
const adminFeatureSource = readAllSourceFiles("apps/admin-web/src/features");
const adminSource = `${adminAppSource}\n${adminRoutesSource}\n${adminClientSource}\n${adminConsoleSource}\n${adminFeatureSource}`;
// The creator-web CreatorApp component was split across hooks/, pages/, and
// components/ files as a pure restructure; concatenate the whole src tree so
// source-content assertions below still see every identifier/behavior.
const creatorSource = readAllSourceFiles("apps/creator-web/src");
// Store's entrypoint is intentionally only a mount point. Its public behavior
// lives in the app/router composition and feature modules.
const storeAppComposition = [
  "apps/app-store-pwa/src/app/StoreApp.tsx",
  "apps/app-store-pwa/src/routes/StoreRoutes.tsx"
]
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const storePublicFeatureSource = readAllSourceFiles("apps/app-store-pwa/src/features");
const storeSharedSource = readAllSourceFiles("apps/app-store-pwa/src/shared");
const storeSource = `${storeAppComposition}\n${storePublicFeatureSource}\n${storeSharedSource}`;
const uiStyles = readFileSync("packages/ui/styles.css", "utf8");
const appConfig = readFileSync("packages/config/src/index.ts", "utf8");
const caddyfile = readFileSync("docker/Caddyfile", "utf8");
const storeBootstrapSource = readFileSync(
  "apps/app-store-pwa/src/features/storefront/bootstrap.ts",
  "utf8"
);
const creatorWorkspaceHookSource = readFileSync(
  "apps/creator-web/src/features/workspace/use-vibe-workspace.ts",
  "utf8"
);
const creatorPublishHookSource = readFileSync(
  "apps/creator-web/src/features/publish/use-publish-access.ts",
  "utf8"
);

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

test("Admin AI provider API contract is exposed by the shared client", () => {
  assert.match(apiClient, /AiProviderTestCallInput/);
  assert.match(apiClient, /AiProviderTestCallResponse/);
  assert.match(apiClient, /\/ai\/provider-test-call/);
  assert.match(adminClientSource, /createSessionAwareFetch/);
  assert.doesNotMatch(adminFeatureSource, /fetch\(`\$\{baseUrl\}\/ai\/provider-test-call`/);
});

test("Admin AI governance actions are API-client backed", () => {
  assert.match(adminSource, /useAiGovernance/);
  assert.match(adminSource, /AI governance data is unavailable/);
  assert.doesNotMatch(adminSource, /Provider save failed; local fallback rows remain visible/);
  assert.doesNotMatch(adminSource, /replace-before-production/);

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
    assert.match(aiGovernanceHookSource, new RegExp(method));
  }

  for (const handler of [
    "createProvider",
    "saveApiKey",
    "configureRoute",
    "configureQuota",
    "createGuardrailRule"
  ]) {
    assert.match(aiGovernanceHookSource, new RegExp(handler));
  }

  assert.match(adminFeatureSource, /ai\.availability/);
  assert.match(adminFeatureSource, /DecisionPanel/);
  assert.doesNotMatch(adminFeatureSource, /fetch\(`\$\{baseUrl\}\/ai\/providers`/);
  assert.doesNotMatch(adminFeatureSource, /fetch\(`\$\{baseUrl\}\/guardrails\/rules`/);
});

test("frontend shells use API-backed bootstrap instead of direct mock fixtures", () => {
  for (const source of [adminSource, creatorSource, storeSource]) {
    assert.doesNotMatch(source, /@evcp\/mock-data/);
    assert.match(source, /createSessionAwareFetch/);
  }
  assert.match(adminConsoleSource, /catch\(\(\) => setSetupStatus\("incomplete"\)\)/);
  assert.doesNotMatch(creatorWorkspaceHookSource, /Local fallback/);
  assert.doesNotMatch(creatorPublishHookSource, /Local fallback/);
  assert.doesNotMatch(storeBootstrapSource, /local fallback/);

  // Admin delegates platform session-token handling to its extracted admin-client module.
  assert.match(adminClientSource, /platformSessionToken/);
  assert.match(creatorSource, /platformSessionToken/);
  assert.match(storeSource, /createPlatformSessionStore/);

  assert.match(adminSource, /getSetupStatus/);
  assert.match(creatorSource, /loadCreatorBootstrap/);
  assert.match(creatorPublishHookSource, /runtimeDeployments/);
  assert.match(creatorPublishHookSource, /visibleDeployment/);
  assert.match(creatorSource, /listDeployments/);
  assert.match(storeSource, /loadStoreBootstrap/);
});

test("Store and Creator fail closed instead of creating local success evidence", () => {
  assert.match(storeBootstrapSource, /status: "loading" \| "ready" \| "error"/);
  for (const source of [
    storeBootstrapSource,
    creatorWorkspaceHookSource,
    creatorPublishHookSource
  ]) {
    assert.doesNotMatch(source, /Local fallback (generated|produced|recorded|kept)/);
    assert.doesNotMatch(source, /fallbackWorkspacePromptResult/);
  }
  assert.match(creatorTicketInboxSource, /refreshCreatorTicketInbox/);
  assert.match(creatorTicketActionsSource, /\/creator\/projects\//);
  assert.match(creatorTicketActionsSource, /encodeURIComponent\(projectId\)/);
  assert.match(creatorTicketInboxSource, /No local ticket records are shown/);
  assert.doesNotMatch(creatorTicketsSource, /creatorTickets|prdChangeRows/);
  assert.doesNotMatch(creatorAppHookSource, /prdSections|versionRows/);
  assert.doesNotMatch(
    creatorPublishPageSource,
    /dep_leave_management_001|\/apps\/\$\{selectedProject\.id\}/
  );
  assert.match(creatorPublishPageSource, /No deployment record/);
});

test("Admin operations and audit views use Platform API data and fail closed", () => {
  assert.match(adminOperationsSource, /\/admin\/production\/observability/);
  assert.match(adminOperationsSource, /No local health evidence is shown/);
  assert.match(adminAuditSource, /\/audit-logs/);
  assert.match(adminAuditSource, /No local records are shown/);
  assert.doesNotMatch(
    adminConsoleSource,
    /serviceHealthRows|productionServiceRows|authProviderRows/
  );
});

test("frontend shells retain platform session handling while Admin exposes logout only", () => {
  for (const source of [creatorSource, storeSource]) {
    assert.match(source, /createPlatformSessionStore/);
    assert.doesNotMatch(source, /simulateSsoLogin/);
    assert.match(source, /Logout/);
  }
  assert.match(adminClientSource, /createPlatformSessionStore/);
  assert.match(adminConsoleSource, /Logout/);
  assert.match(adminRoutesSource, /AdminLoginScreen/);
  // Admin and Creator use automatic session bridges and expose only Logout. Store retains its
  // visible sign-in/refresh control because it has a distinct session-recovery workflow.
  assert.doesNotMatch(adminSource, /Sign in|Refresh Session/);
  assert.match(storeSource, /Sign in|Refresh Session/);

  assert.match(creatorSource, /startKeycloakLogin/);
  assert.match(storeSource, /startKeycloakLogin/);
});

test("Creator preview establishes an HttpOnly session without putting bearer tokens in URLs", () => {
  const workspacePage = readFileSync(
    "apps/creator-web/src/features/workspace/WorkspacePage.tsx",
    "utf8"
  );
  const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
  const previewSessionRoutePath =
    "apps/platform-api/src/workspace-orchestrator/preview-session-route.ts";

  assert.doesNotMatch(workspacePage, /platformSessionToken/);
  assert.doesNotMatch(workspacePage, /[?&]token=/);
  assert.match(workspacePage, /authorizeWorkspacePreview/);
  assert.match(workspacePage, /previewAuthorizationState/);
  assert.match(
    workspacePage,
    /\[selectedProject\.id, vibePreviewKey, previewAuthorizationAttempt\]/
  );
  assert.match(apiClient, /authorizeWorkspacePreview\(projectId: string\)/);
  assert.match(apiClient, /workspace\/preview-session/);
  assert.match(appFactory, /registerPreviewSessionRoute/);
  assert.doesNotMatch(appFactory, /queryToken/);
  assert.equal(existsSync(previewSessionRoutePath), true);
  const previewSessionRoute = readFileSync(previewSessionRoutePath, "utf8");
  assert.match(previewSessionRoute, /HttpOnly/);
  assert.match(previewSessionRoute, /SameSite=Strict/);
});

test("Admin and Creator shells render separate page branches instead of one combined evidence page", () => {
  assert.match(adminConsoleSource, /adminPageFromPath/);
  assert.match(adminConsoleSource, /OperationsDashboard/);
  assert.match(adminConsoleSource, /AppShell/);
  for (const branch of [
    'page === "services"',
    'page === "ai-providers"',
    'page === "guardrails"',
    'page === "audit-logs"',
    'page === "users"'
  ]) {
    assert.match(adminSource, new RegExp(branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(creatorSource, /creatorRouteFromPath/);
  assert.match(creatorSource, /const creatorPage = creatorRoute\.page/);
  assert.match(creatorSource, /CreatorRoutes/);
  assert.match(creatorSource, /CreatorShell/);
  assert.match(creatorSource, /creatorPageCopy/);
  for (const branch of [
    'creatorPage === "projects"',
    'creatorPage === "workspace"',
    'creatorPage === "prd"',
    'creatorPage === "database"',
    'creatorPage === "versions"',
    'creatorPage === "users"',
    'creatorPage === "publish"',
    'creatorPage === "deployments"',
    'creatorPage === "tickets"',
    'creatorPage === "ticket-detail"'
  ]) {
    assert.match(creatorSource, new RegExp(branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(uiStyles, /\.admin-page-stack/);
  assert.match(caddyfile, /redir \/creator \/creator\/ 308/);
  assert.match(caddyfile, /redir \/store \/store\/ 308/);
  assert.match(appConfig, /route: "\/creator\/"/);
  assert.match(appConfig, /route: "\/store\/"/);
});

test("Admin setup wizard is API-client backed and exposes step controls", () => {
  const setupWizard = readFileSync("apps/admin-web/src/setup-wizard.tsx", "utf8");
  assert.match(setupWizard, /initializeSetup/);
  assert.match(setupWizard, /createAdminPlatformClient/);
  assert.match(setupWizard, /setStep\(2\)/);
  assert.match(setupWizard, /setStep\(1\)/);
  assert.match(setupWizard, /Create admin & finish/);
  assert.match(setupWizard, /Next/);
  assert.match(setupWizard, /Back/);
  assert.doesNotMatch(setupWizard, /fetch\(`\$\{baseUrl\}\/admin\/installer\/preflight`/);
});

test("App Store logout revokes the Platform session before ending Keycloak SSO", () => {
  assert.match(storeSource, /request\("\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(storeSource, /beginStoreKeycloakLogout\(\)/);
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

test("Creator project wizard creates a real project and generates the PRD draft in the background", () => {
  for (const method of ["createProject", "generatePrdDraft", "listPrdVersions", "getCurrentPrd"]) {
    assert.match(apiClient, new RegExp(`${method}\\(`));
    assert.match(creatorSource, new RegExp(method));
  }

  assert.match(creatorSource, /handleCreateProjectSubmit/);
  assert.match(creatorSource, /"Create Project"/);
  assert.match(creatorSource, /client\.createProject/);
  assert.match(creatorSource, /client\.generatePrdDraft/);
  assert.match(creatorSource, /beginBackgroundPrdGeneration\(project\.id\)/);
  assert.match(creatorSource, /runBackgroundPrdGeneration/);
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
    "handleAccessRequestDecision",
    "handlePublishProject"
  ]) {
    assert.match(creatorSource, new RegExp(handler));
  }

  assert.match(creatorSource, /publishResult/);
  assert.match(creatorSource, /appAccessSnapshot/);
});
