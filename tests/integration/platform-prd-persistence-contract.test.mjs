import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryPrdPersistenceClient,
  createPrdRepositoryBackedService
} from "../../apps/platform-api/src/persistence/prd-repositories.ts";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

const creatorActor = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["project:create", "prd:write"]
};

const project = {
  id: "prj_leave_persisted",
  slug: "leave-persisted",
  name: "Leave Persisted",
  status: "draft",
  ownerUserId: "usr_creator",
  appType: "Workflow App",
  businessProblem: "Employees need self-service leave requests with manager approval",
  targetDepartment: "HR Department",
  intendedUsers: ["Employee", "Manager"],
  dataSensitivity: "internal",
  appId: "app_leave_persisted",
  createdAt: "2026-07-04T00:00:00.000Z"
};

test("PRD persistence service generates baseline and lists persisted sections", async () => {
  const service = createPrdRepositoryBackedService(new MemoryPrdPersistenceClient());

  const draft = await service.generateDraft(creatorActor, {
    project,
    sourcePrompt: "Create a PRD for Leave Persisted.",
    generatedBy: { scenario: "prd_generation", providerId: "aip_openai", model: "gpt-4.1-mini" },
    aiSummary: "AI Gateway Summary: governed provider response"
  });
  const baseline = await service.confirmBaseline(creatorActor, project, draft.id);
  const versions = await service.listVersions(creatorActor, project);
  const current = await service.getCurrent(creatorActor, project);

  assert.equal(draft.status, "draft");
  assert.equal(draft.version, "0.1");
  assert.equal(draft.sections.length >= 6, true);
  assert.equal(baseline.status, "baseline");
  assert.equal(baseline.version, "1.0");
  assert.equal(baseline.isBaseline, true);
  assert.equal(current.id, baseline.id);
  assert.equal(
    versions.some((version) => version.id === draft.id),
    true
  );
  assert.equal(
    versions.some((version) => version.id === baseline.id),
    true
  );
  assert.equal(
    baseline.sections.every((section) => section.id.includes(baseline.id)),
    true
  );
});

test("runtime persistence wiring exposes PRD service and routes", () => {
  assert.match(appFactory, /prdPersistence\?: PrdRepositoryBackedService/);
  assert.match(
    appFactory,
    /createPrdRepositoryBackedService\(\s*new MemoryPrdPersistenceClient\(\)\s*\)/
  );
  assert.match(appFactory, /createPrismaPrdPersistence\(\s*env\.DATABASE_URL\s*\)/);
  assert.match(appFactory, /isPersistencePrdRoute/);
  assert.match(persistenceDoc, /PRD Route-Level Coverage/);
});
