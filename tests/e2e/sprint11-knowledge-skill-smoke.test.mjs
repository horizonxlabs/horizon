import { readAllSourceFiles } from "./read-creator-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { executePlatformApiRequest } = await import("../../apps/platform-api/src/app-factory.ts");
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

function createBaselineProject(services) {
  const provider = executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/providers",
    headers: adminHeaders,
    body: {
      name: "OpenAI Production",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1"]
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/api-keys",
    headers: adminHeaders,
    body: {
      providerId: provider.body.data.id,
      name: "Primary Production Key",
      secret: "sk-test-secret-that-must-not-leak",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 1
    }
  });
  for (const scenario of ["prd_generation", "requirement_analysis", "frontend_coding"]) {
    executePlatformApiRequest(services, {
      method: "POST",
      path: "/ai/routes",
      headers: adminHeaders,
      body: {
        scenario,
        primaryProviderId: provider.body.data.id,
        primaryModel: "gpt-4.1"
      }
    });
  }
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/ai/quotas",
    headers: adminHeaders,
    body: {
      scope: "creator",
      dailyLimit: 1000,
      monthlyLimit: 5000,
      warningThreshold: 800,
      hardStop: true,
      usedToday: 0
    }
  });
  const project = executePlatformApiRequest(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Management Sprint 11",
      slug: "leave-management-sprint-11",
      appType: "Workflow App",
      businessProblem: "Employees need governed leave policy automation",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager", "HR Admin"],
      dataSensitivity: "internal"
    }
  });
  const draft = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/generate`,
    headers: creatorHeaders
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/baseline`,
    headers: creatorHeaders,
    body: { versionId: draft.body.data.id }
  });
  return project.body.data;
}

test("Sprint 11 API supports knowledge approval and scoped retrieval", () => {
  const services = createPlatformApiServices();
  const project = createBaselineProject(services);

  const source = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/knowledge/sources",
    headers: adminHeaders,
    body: {
      title: "HR Leave Policy Handbook",
      sourceType: "markdown",
      ownerUserId: "usr_admin",
      uploadStatus: "uploaded",
      indexStatus: "indexed",
      scope: {
        visibility: "project",
        department: "HR Department",
        projectIds: [project.id],
        appIds: [project.appId],
        agentRoles: ["frontend_developer"],
        scenarios: ["frontend_coding"]
      }
    }
  });
  assert.equal(source.status, 201);

  const version = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/knowledge/sources/${source.body.data.id}/versions`,
    headers: adminHeaders,
    body: {
      version: "v1",
      contentHash: "sha256:api-knowledge-v1",
      changelog: "Initial API approved knowledge",
      chunkCount: 2,
      excerpts: ["WFH leave needs policy notice."]
    }
  });
  assert.equal(version.status, 201);

  const approved = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/knowledge/versions/${version.body.data.id}/approve`,
    headers: adminHeaders,
    body: { decision: "approved", note: "Approved for workspace prompts" }
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.version.lifecycleStatus, "active");

  const retrieval = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/knowledge/retrieve",
    headers: creatorHeaders,
    body: {
      projectId: project.id,
      appId: project.appId,
      department: "HR Department",
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      query: "WFH leave"
    }
  });
  assert.equal(retrieval.status, 200);
  assert.deepEqual(retrieval.body.data.matchedVersionIds, [version.body.data.id]);

  const missingProjectContext = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/knowledge/retrieve",
    headers: creatorHeaders,
    body: {
      department: "HR Department",
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      query: "WFH leave"
    }
  });
  assert.equal(missingProjectContext.status, 422);
  assert.equal(missingProjectContext.body.error.code, "VALIDATION_ERROR");
});

test("Sprint 11 API supports skill approval assignment resolution and protected admin routes", () => {
  const services = createPlatformApiServices();
  const project = createBaselineProject(services);

  const denied = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills",
    headers: creatorHeaders,
    body: { key: "creator-denied", name: "Denied", ownerUserId: "usr_creator" }
  });
  assert.equal(denied.status, 403);

  const skill = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills",
    headers: adminHeaders,
    body: {
      key: "frontend-developer-leave",
      name: "Frontend Developer Leave Skill",
      description: "Generate governed leave management frontend changes",
      ownerUserId: "usr_admin"
    }
  });
  assert.equal(skill.status, 201);

  const version = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/skills/${skill.body.data.id}/versions`,
    headers: adminHeaders,
    body: {
      version: "v1",
      instruction: "Use approved leave policy before generating UI.",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      requiredKnowledgeSourceIds: [],
      allowedTools: ["prd_reader", "ui_generator"]
    }
  });
  assert.equal(version.status, 201);

  executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/skills/versions/${version.body.data.id}/approve`,
    headers: adminHeaders,
    body: { decision: "approved", note: "Approved skill" }
  });

  const assignment = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills/assignments",
    headers: adminHeaders,
    body: {
      skillVersionId: version.body.data.id,
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      scopeType: "project",
      scopeId: project.id,
      priority: 20
    }
  });
  assert.equal(assignment.status, 201);

  const resolved = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills/resolve",
    headers: creatorHeaders,
    body: {
      projectId: project.id,
      appId: project.appId,
      department: "HR Department",
      agentRole: "frontend_developer",
      scenario: "frontend_coding"
    }
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.data.skillVersionId, version.body.data.id);

  const missingProjectContext = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills/resolve",
    headers: creatorHeaders,
    body: {
      department: "HR Department",
      agentRole: "frontend_developer",
      scenario: "frontend_coding"
    }
  });
  assert.equal(missingProjectContext.status, 422);
  assert.equal(missingProjectContext.body.error.code, "VALIDATION_ERROR");
});

test("Sprint 11 workspace prompt returns governed knowledge and skill metadata", () => {
  const services = createPlatformApiServices();
  const project = createBaselineProject(services);
  const source = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/knowledge/sources",
    headers: adminHeaders,
    body: {
      title: "HR Leave Policy Handbook",
      sourceType: "markdown",
      ownerUserId: "usr_admin",
      uploadStatus: "uploaded",
      indexStatus: "indexed",
      scope: {
        visibility: "project",
        department: "HR Department",
        projectIds: [project.id],
        appIds: [project.appId],
        agentRoles: ["frontend_developer"],
        scenarios: ["frontend_coding"]
      }
    }
  });
  const knowledgeVersion = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/knowledge/sources/${source.body.data.id}/versions`,
    headers: adminHeaders,
    body: {
      version: "v1",
      contentHash: "sha256:workspace-knowledge-v1",
      changelog: "Workspace knowledge",
      chunkCount: 1,
      excerpts: ["WFH leave needs manager approval."]
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/knowledge/versions/${knowledgeVersion.body.data.id}/approve`,
    headers: adminHeaders,
    body: { decision: "approved", note: "Approved" }
  });

  const skill = executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills",
    headers: adminHeaders,
    body: {
      key: "frontend-developer-leave",
      name: "Frontend Developer Leave Skill",
      ownerUserId: "usr_admin"
    }
  });
  const skillVersion = executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/skills/${skill.body.data.id}/versions`,
    headers: adminHeaders,
    body: {
      version: "v1",
      instruction: "Use approved leave policy before generating UI.",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      requiredKnowledgeSourceIds: [source.body.data.id],
      allowedTools: ["prd_reader", "ui_generator"]
    }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: `/admin/skills/versions/${skillVersion.body.data.id}/approve`,
    headers: adminHeaders,
    body: { decision: "approved", note: "Approved" }
  });
  executePlatformApiRequest(services, {
    method: "POST",
    path: "/admin/skills/assignments",
    headers: adminHeaders,
    body: {
      skillVersionId: skillVersion.body.data.id,
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      scopeType: "project",
      scopeId: project.id,
      priority: 20
    }
  });

  const prompt = executePlatformApiRequest(services, {
    method: "POST",
    path: `/projects/${project.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add WFH leave type with policy notice" }
  });

  assert.equal(prompt.status, 201);
  assert.deepEqual(prompt.body.data.knowledgeRetrieval.matchedVersionIds, [
    knowledgeVersion.body.data.id
  ]);
  assert.equal(prompt.body.data.skillSelection.skillVersionId, skillVersion.body.data.id);
  assert.deepEqual(prompt.body.data.task.knowledgeVersionIds, [knowledgeVersion.body.data.id]);
});

test("Sprint 11 Admin UI wires Knowledge and Skill governance to the live API", () => {
  const adminSource = readAllSourceFiles("apps/admin-web/src");

  // The console must render the real, API-backed feature and hit the governance endpoints —
  // not the former static demo rows.
  for (const text of [
    "KnowledgeSkillsConsole",
    "useKnowledgeSkills",
    "/admin/knowledge/sources",
    "/admin/knowledge/retrieval-logs",
    "/admin/skills",
    "/admin/skills/assignments"
  ]) {
    assert.match(adminSource, new RegExp(text));
  }
  for (const removed of ["knowledgeSourceRows", "HR Leave Policy Handbook", "Frontend Developer Leave Skill"]) {
    assert.doesNotMatch(adminSource, new RegExp(removed));
  }
});
