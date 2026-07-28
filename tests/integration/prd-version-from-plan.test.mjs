import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformApiServices } from "../../apps/platform-api/src/platform-services.ts";
import { createPlanVersionRecorder } from "../../apps/platform-api/src/prd/plan-version.ts";
import { renderSpecVersion } from "../../apps/platform-api/src/prd/baseline-spec.ts";

function services() {
  const s = createPlatformApiServices();
  const admin = s.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = s.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const provider = s.aiGovernance.createProvider(admin, { name: "OpenAI", adapter: "openai", baseUrl: "https://api.openai.com/v1", models: ["gpt-4.1"] });
  s.aiGovernance.createApiKey(admin, { providerId: provider.id, name: "Key", secret: "sk-test-secret-not-real", usageMode: "production", quotaTokens: 100000, fallbackPriority: 1 });
  s.aiGovernance.configureRoute(admin, { scenario: "prd_generation", primaryProviderId: provider.id, primaryModel: "gpt-4.1" });
  s.aiGovernance.configureQuota(admin, { scope: "creator", dailyLimit: 1000, monthlyLimit: 5000, warningThreshold: 800, hardStop: true, usedToday: 0 });
  return { s, creator };
}

test("approving a plan records a draft version that, once confirmed, grounds Phase A", async () => {
  const { s, creator } = services();
  const project = s.projects.createProject({ actor: creator, name: "Leave", slug: "leave-plan-b2", appType: "Workflow App", businessProblem: "Governed leave flow", targetDepartment: "HR", intendedUsers: ["Employee"], dataSensitivity: "internal" });
  const draft = s.prds.generateDraft(creator, project.id);
  s.prds.confirmBaseline(creator, project.id, draft.id);

  const version = await createPlanVersionRecorder(s.prds)(creator, project.id, "Add a monthly report page with CSV export");
  assert.equal(version.isBaseline, false);
  const coreFlows = version.sections.find((section) => section.key === "core_flows");
  assert.ok(coreFlows.body.includes("Add a monthly report page with CSV export"));

  // The approved plan becomes the current version, so the spec Phase A grounds on (the current
  // version, gated by a confirmed baseline) now includes the plan — the spec evolved.
  const spec = renderSpecVersion(s.prds.getCurrent(creator, project.id));
  assert.ok(spec.includes("Add a monthly report page with CSV export"));
  // The original baseline is preserved as a historical anchor and stays immutable.
  assert.ok(s.prds.listVersions(creator, project.id).some((v) => v.isBaseline));
});
