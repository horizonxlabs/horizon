import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint11Fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const endUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "user@company.com" });
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });
  services.aiGovernance.createApiKey(admin, {
    providerId: provider.id,
    name: "Primary Production Key",
    secret: "sk-test-secret-that-must-not-leak",
    usageMode: "production",
    quotaTokens: 100000,
    fallbackPriority: 1
  });

  for (const scenario of ["prd_generation", "requirement_analysis", "frontend_coding"]) {
    services.aiGovernance.configureRoute(admin, {
      scenario,
      primaryProviderId: provider.id,
      primaryModel: "gpt-4.1"
    });
  }
  services.aiGovernance.configureQuota(admin, {
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 5000,
    warningThreshold: 800,
    hardStop: true,
    usedToday: 0
  });

  const project = services.projects.createProject({
    actor: creator,
    name: "Leave Management Knowledge",
    slug: "leave-management-knowledge",
    appType: "Workflow App",
    businessProblem: "Employees need governed leave policy automation",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);

  return { services, admin, creator, endUser, project };
}

function createApprovedKnowledge(services, admin, project) {
  const source = services.knowledge.createSource(admin, {
    title: "HR Leave Policy Handbook",
    sourceType: "markdown",
    ownerUserId: admin.id,
    scope: {
      visibility: "project",
      department: "HR Department",
      projectIds: [project.id],
      appIds: [project.appId],
      agentRoles: ["frontend_developer"],
      scenarios: ["frontend_coding"]
    },
    uploadStatus: "uploaded",
    indexStatus: "indexed",
    tags: ["leave", "policy"]
  });
  const version = services.knowledge.submitVersion(admin, source.id, {
    version: "v1",
    contentHash: "sha256:leave-policy-v1",
    changelog: "Initial approved HR leave policy",
    chunkCount: 3,
    excerpts: ["WFH leave requires manager approval.", "HR admins can review policy exceptions."]
  });
  services.knowledge.approveVersion(admin, {
    versionId: version.id,
    decision: "approved",
    note: "Approved for Sprint 11 workspace context"
  });
  return { source, version };
}

function createApprovedSkill(services, admin, project, sourceId) {
  const skill = services.skills.createSkill(admin, {
    key: "frontend-developer-leave",
    name: "Frontend Developer Leave Skill",
    description: "Generate governed leave management frontend changes",
    ownerUserId: admin.id
  });
  const version = services.skills.submitVersion(admin, skill.id, {
    version: "v1",
    instruction: "Use approved leave policy knowledge before generating frontend changes.",
    inputSchema: { type: "object", required: ["prompt"] },
    outputSchema: { type: "object", required: ["preview"] },
    requiredKnowledgeSourceIds: [sourceId],
    allowedTools: ["prd_reader", "ui_generator", "policy_checker"]
  });
  services.skills.approveVersion(admin, {
    versionId: version.id,
    decision: "approved",
    note: "Approved active skill contract"
  });
  const assignment = services.skills.assign(admin, {
    skillVersionId: version.id,
    agentRole: "frontend_developer",
    scenario: "frontend_coding",
    scopeType: "project",
    scopeId: project.id,
    priority: 20
  });
  return { skill, version, assignment };
}

test("Sprint 11 knowledge library approves immutable versions and retrieves only approved scoped knowledge", () => {
  const { services, admin, creator, endUser, project } = createSprint11Fixture();
  const source = services.knowledge.createSource(admin, {
    title: "Payroll Export Restricted",
    sourceType: "pdf",
    ownerUserId: admin.id,
    scope: {
      visibility: "department",
      department: "Finance Department",
      projectIds: ["prj_finance"],
      agentRoles: ["frontend_developer"],
      scenarios: ["frontend_coding"]
    },
    uploadStatus: "uploaded",
    indexStatus: "indexed",
    tags: ["finance"]
  });
  const pending = services.knowledge.submitVersion(admin, source.id, {
    version: "v1",
    contentHash: "sha256:payroll-v1",
    changelog: "Finance only export rules",
    chunkCount: 1,
    excerpts: ["Payroll export is restricted to Finance."]
  });

  const beforeApproval = services.knowledge.retrieve(creator, {
    projectId: project.id,
    appId: project.appId,
    department: "HR Department",
    agentRole: "frontend_developer",
    scenario: "frontend_coding",
    query: "payroll export"
  });
  assert.deepEqual(beforeApproval.matchedVersionIds, []);

  const approved = services.knowledge.approveVersion(admin, {
    versionId: pending.id,
    decision: "approved",
    note: "Approved but Finance-scoped"
  });
  assert.equal(approved.version.approvalStatus, "approved");
  assert.equal(approved.version.lifecycleStatus, "active");
  assert.ok(approved.auditEventId);

  const denied = services.knowledge.retrieve(creator, {
    projectId: project.id,
    appId: project.appId,
    department: "HR Department",
    agentRole: "frontend_developer",
    scenario: "frontend_coding",
    query: "payroll export"
  });
  assert.deepEqual(denied.matchedVersionIds, []);
  assert.ok(denied.deniedReasons.some((reason) => reason.includes("department")));

  assert.throws(
    () =>
      services.knowledge.retrieve(creator, {
        department: "Finance Department",
        agentRole: "frontend_developer",
        scenario: "frontend_coding",
        query: "payroll export"
      }),
    /Creator knowledge retrieval requires project context/
  );

  assert.throws(
    () =>
      services.knowledge.retrieve(endUser, {
        projectId: project.id,
        appId: project.appId,
        department: "HR Department",
        agentRole: "frontend_developer",
        scenario: "frontend_coding",
        query: "payroll export"
      }),
    /Role end_user cannot access this resource/
  );
});

test("Sprint 11 skill library approves version contracts, resolves assignments and excludes disabled skills", () => {
  const { services, admin, creator, project } = createSprint11Fixture();
  const { source } = createApprovedKnowledge(services, admin, project);
  const { skill, version, assignment } = createApprovedSkill(services, admin, project, source.id);

  const resolved = services.skills.resolve(creator, {
    projectId: project.id,
    appId: project.appId,
    department: "HR Department",
    agentRole: "frontend_developer",
    scenario: "frontend_coding"
  });

  assert.equal(resolved.skill.id, skill.id);
  assert.equal(resolved.version.id, version.id);
  assert.equal(resolved.assignment.id, assignment.id);
  assert.deepEqual(resolved.version.requiredKnowledgeSourceIds, [source.id]);
  assert.deepEqual(resolved.version.allowedTools, ["prd_reader", "ui_generator", "policy_checker"]);

  services.skills.disableSkill(admin, skill.id, "Retired for policy update");
  assert.throws(
    () =>
      services.skills.resolve(creator, {
        projectId: project.id,
        appId: project.appId,
        department: "HR Department",
        agentRole: "frontend_developer",
        scenario: "frontend_coding"
      }),
    /No approved active skill/
  );

  assert.throws(
    () =>
      services.skills.resolve(creator, {
        department: "HR Department",
        agentRole: "frontend_developer",
        scenario: "frontend_coding"
      }),
    /Creator skill resolution requires project context/
  );
});

test("Sprint 11 workspace prompt records selected knowledge and skill metadata", () => {
  const { services, admin, creator, project } = createSprint11Fixture();
  const { source, version: knowledgeVersion } = createApprovedKnowledge(services, admin, project);
  const { version: skillVersion } = createApprovedSkill(services, admin, project, source.id);

  const result = services.workspace.submitPrompt(creator, project.id, {
    prompt: "Add WFH leave type with policy notice"
  });

  assert.equal(result.guardrail.decision, "allow");
  assert.equal(result.task.status, "ready");
  assert.deepEqual(result.task.knowledgeVersionIds, [knowledgeVersion.id]);
  assert.equal(result.task.skillVersionId, skillVersion.id);
  assert.deepEqual(result.knowledgeRetrieval.matchedVersionIds, [knowledgeVersion.id]);
  assert.equal(result.knowledgeRetrieval.sources[0].title, "HR Leave Policy Handbook");
  assert.equal(result.skillSelection.skillVersionId, skillVersion.id);
  assert.ok(result.skillSelection.allowedTools.includes("ui_generator"));
  assert.ok(services.audit.list().some((event) => event.action === "workspace.prompt.accepted" && event.metadata.skillVersionId === skillVersion.id));
});
