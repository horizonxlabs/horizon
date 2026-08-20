import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlatformApiServices } from "../../apps/platform-api/src/platform-services.ts";
import { executePlatformApiRequestAsync } from "../../apps/platform-api/src/app-factory.ts";
import {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/core-repositories.ts";
import { MemoryAiGovernancePersistenceClient } from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";
import {
  MemoryPrdPersistenceClient,
  createPrdRepositoryBackedService
} from "../../apps/platform-api/src/persistence/prd-repositories.ts";
import {
  MemoryWorkspacePersistenceClient,
  createWorkspaceRepositoryBackedService
} from "../../apps/platform-api/src/persistence/workspace-repositories.ts";
import { createPersistedGovernedAiFixture } from "../helpers/persisted-governed-ai-fixture.ts";

const adminHeaders = { "x-mock-user-email": "admin@company.com" };
const creatorHeaders = { "x-mock-user-email": "creator@company.com" };

async function createPersistentServices(coreClient, aiClient, prdClient, workspaceClient) {
  const legacyServices = createPlatformApiServices();
  const admin = legacyServices.auth.resolveCurrentUser(adminHeaders);
  const governedAi = await createPersistedGovernedAiFixture(aiClient, admin);
  const services = {
    ...legacyServices,
    corePersistence: createCoreRepositoryBackedService(coreClient),
    aiGovernancePersistence: governedAi.service,
    governedAiExecutor: governedAi.executor,
    prdPersistence: createPrdRepositoryBackedService(prdClient),
    workspacePersistence: createWorkspaceRepositoryBackedService(workspaceClient)
  };
  return services;
}

async function createProjectWithBaseline(services) {
  const project = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Leave Workspace Persisted",
      slug: "leave-workspace-persisted",
      appType: "Workflow App",
      businessProblem: "Employees need persisted workspace prompt state",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager"],
      dataSensitivity: "internal"
    }
  });
  assert.equal(project.status, 201);

  const draft = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/generate`,
    headers: creatorHeaders
  });
  assert.equal(draft.status, 201);

  const baseline = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${project.body.data.id}/prd/baseline`,
    headers: creatorHeaders,
    body: { versionId: draft.body.data.id }
  });
  assert.equal(baseline.status, 200);
  return project.body.data;
}

test("runtime memory persistence keeps workspace task preview and usage across service recreation", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const firstServices = await createPersistentServices(coreClient, aiClient, prdClient, workspaceClient);
  const project = await createProjectWithBaseline(firstServices);

  const prompt = await executePlatformApiRequestAsync(firstServices, {
    method: "POST",
    path: `/projects/${project.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Add WFH leave type" }
  });
  assert.equal(prompt.status, 201);
  assert.equal(prompt.body.data.task.status, "ready");
  assert.equal(prompt.body.data.usage.tokensUsed, 120);
  assert.equal(JSON.stringify(prompt.body).includes("secret-that-must-not-return"), false);

  const recreatedServices = await createPersistentServices(
    coreClient,
    aiClient,
    prdClient,
    workspaceClient
  );
  const snapshot = await executePlatformApiRequestAsync(recreatedServices, {
    method: "GET",
    path: `/projects/${project.id}/workspace`,
    headers: creatorHeaders
  });
  const refreshed = await executePlatformApiRequestAsync(recreatedServices, {
    method: "POST",
    path: `/projects/${project.id}/workspace/preview/refresh`,
    headers: creatorHeaders
  });

  assert.equal(snapshot.status, 200);
  assert.match(snapshot.body.data.preview.summary, /WFH leave type/);
  assert.equal(
    snapshot.body.data.tasks.some((task) => task.id === prompt.body.data.task.id),
    true
  );
  assert.equal(
    snapshot.body.data.usage.some((usage) => usage.id === prompt.body.data.usage.id),
    true
  );
  assert.equal(refreshed.body.data.id, snapshot.body.data.preview.id);
});

test("first workspace build bootstraps its PRD baseline before accepting the prompt", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const services = await createPersistentServices(coreClient, aiClient, prdClient, workspaceClient);
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "First Build Project",
      slug: "first-build-project",
      appType: "Workflow App",
      businessProblem: "Track internal equipment requests",
      targetDepartment: "Operations",
      intendedUsers: ["Requester", "Approver"],
      dataSensitivity: "internal"
    }
  });

  const prompt = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${created.body.data.id}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Build the equipment request dashboard" }
  });
  const baseline = await prdClient.prdDocument.findUnique({
    where: { projectId: created.body.data.id },
    include: { versions: { include: { sections: true }, orderBy: { createdAt: "asc" } } }
  });

  assert.equal(created.status, 201);
  assert.equal(prompt.status, 201);
  assert.equal(prompt.body.data.task.status, "ready");
  assert.equal(baseline.baselineVersionId, `prdver_${created.body.data.id}_baseline_v1_0`);
});

// Regression: getCurrent() throws "No current PRD version..." (not "No PRD document...")
// when a document row already exists but nothing has been confirmed as current — a state a
// partially-completed PRD wizard can leave behind. The bootstrap catch in app-factory.ts
// once matched only a "No PRD document" prefix and let this second message escape as a
// 4xx, blocking the very first build for that project.
test("first workspace build still bootstraps a baseline when a PRD document exists with no current version", async () => {
  const coreClient = new MemoryCorePersistenceClient();
  const aiClient = new MemoryAiGovernancePersistenceClient();
  const prdClient = new MemoryPrdPersistenceClient();
  const workspaceClient = new MemoryWorkspacePersistenceClient();
  const services = await createPersistentServices(coreClient, aiClient, prdClient, workspaceClient);
  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/projects",
    headers: creatorHeaders,
    body: {
      name: "Stalled PRD Project",
      slug: "stalled-prd-project",
      appType: "Workflow App",
      businessProblem: "Track internal equipment requests",
      targetDepartment: "Operations",
      intendedUsers: ["Requester", "Approver"],
      dataSensitivity: "internal"
    }
  });
  const projectId = created.body.data.id;
  await prdClient.prdDocument.upsert({
    where: { projectId },
    update: {},
    create: {
      id: `prddoc_${projectId}`,
      projectId,
      status: "draft",
      currentVersionId: null,
      updatedAt: new Date().toISOString()
    }
  });

  const prompt = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: `/projects/${projectId}/workspace/prompts`,
    headers: creatorHeaders,
    body: { prompt: "Build the equipment request dashboard" }
  });

  assert.equal(created.status, 201);
  assert.equal(prompt.status, 201);
  assert.equal(prompt.body.data.task.status, "ready");
});
