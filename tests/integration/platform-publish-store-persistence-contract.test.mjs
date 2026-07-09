import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryPublishStorePersistenceClient,
  createPublishStoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/publish-store-repositories.ts";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const repositorySource = readFileSync(
  "apps/platform-api/src/persistence/publish-store-repositories.ts",
  "utf8"
);
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

const creatorActor = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["project:create", "app:publish-request", "ticket:manage"]
};

const endUserActor = {
  id: "usr_end_user",
  email: "user@company.com",
  name: "End User",
  role: "end_user",
  status: "active",
  permissions: ["store:view", "ticket:create"]
};

const project = {
  id: "prj_publish_persisted",
  name: "Publish Persisted",
  status: "draft",
  ownerUserId: "usr_creator",
  appType: "Workflow App",
  businessProblem: "Employees need persisted publish and ticket state",
  targetDepartment: "HR Department",
  intendedUsers: ["Employee", "Manager"],
  dataSensitivity: "internal",
  appId: "app_publish_persisted",
  createdAt: "2026-07-04T00:00:00.000Z"
};

const baseline = {
  id: "prdver_publish_persisted_baseline",
  projectId: project.id,
  version: "1.0",
  status: "baseline",
  isBaseline: true,
  sourcePrompt: "Create a PRD.",
  changeSummary: "Baseline confirmed",
  generatedBy: { scenario: "prd_generation", providerId: "aip_openai", model: "gpt-4.1-mini" },
  sections: [
    { id: "prdsec_overview", key: "overview", title: "Overview", body: "Baseline PRD", order: 1 }
  ],
  createdByUserId: "usr_creator",
  createdAt: "2026-07-04T00:00:00.000Z"
};

const preview = {
  id: "preview_publish_persisted_0001",
  projectId: project.id,
  version: "preview-0001",
  summary: "Mock preview updated: Add WFH leave type",
  device: "desktop",
  screenTitle: "Leave Management",
  highlights: ["WFH leave type", "Manager approval queue"],
  createdAt: "2026-07-04T00:05:00.000Z"
};

test("Publish/store persistence service stores access defaults publish registry and tickets", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient()
  );

  const snapshot = await service.getAppAccessSnapshot(creatorActor, { project });
  assert.ok(snapshot.roles.some((role) => role.key === "employee"));
  assert.ok(
    snapshot.members.some(
      (member) => member.email === "user@company.com" && member.roleKey === "employee"
    )
  );

  const invite = await service.createInvitation(creatorActor, {
    project,
    email: "vendor@example.com",
    roleKey: "employee",
    userType: "external",
    note: "Vendor read-only access"
  });
  assert.equal(invite.status, "approval_required");
  assert.match(invite.policyWarning, /External invite requires approval/);

  const review = await service.getPublishReview(creatorActor, { project, baseline, preview });
  assert.equal(review.ready, true);
  assert.equal(review.manifest.prd.version, "1.0");
  assert.equal(review.manifest.frontend.checkpointId, preview.id);

  const publish = await service.publishApp(creatorActor, { project, baseline, preview });
  const registry = await service.listRegistry(creatorActor);
  assert.equal(publish.publishRequest.status, "published");
  assert.equal(publish.deployment.status, "published");
  assert.equal(publish.registryEntry.slug, project.appId);
  assert.equal(
    registry.some((entry) => entry.slug === project.appId),
    true
  );

  const storeHome = await service.listStoreApps(endUserActor);
  assert.ok(
    storeHome.availableApps.some(
      (app) =>
        app.slug === project.appId &&
        app.accessStatus === "active" &&
        app.installStatus === "not_installed"
    )
  );

  const access = await service.requestStoreAccess(endUserActor, {
    appSlug: project.appId,
    requestedRoleKey: "manager",
    reason: "Need manager queue",
    department: "HR"
  });
  assert.equal(access.status, "pending");

  const ticket = await service.createTicket(endUserActor, {
    appSlug: project.appId,
    type: "bug",
    priority: "high",
    title: "WFH leave type missing",
    description: "The WFH option is not visible on mobile.",
    deviceInfo: "iPhone Safari"
  });
  const status = await service.getTicketStatus(endUserActor, ticket.id);
  const inbox = await service.listCreatorInbox(creatorActor, project.id);

  assert.equal(ticket.status, "submitted");
  assert.equal(status.ticketNumber, "TKT-0001");
  assert.ok(status.timeline.some((entry) => entry.status === "submitted"));
  assert.ok(
    inbox.some((item) => item.id === ticket.id && item.submittedByEmail === "user@company.com")
  );
});

test("Publish/store persistence service blocks publish without baseline or preview and denies invisible tickets", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient()
  );

  await assert.rejects(
    () =>
      service.publishApp(creatorActor, {
        project,
        baseline: { ...baseline, isBaseline: false },
        preview
      }),
    /Publish blocked|baseline/i
  );
  await assert.rejects(
    () =>
      service.publishApp(creatorActor, {
        project,
        baseline,
        preview: { ...preview, id: "", version: "" }
      }),
    /Publish blocked|frontend/i
  );
  await assert.rejects(
    () =>
      service.createTicket(endUserActor, {
        appSlug: "hidden-app",
        type: "bug",
        priority: "low",
        title: "Hidden",
        description: "Should not submit",
        deviceInfo: "Safari"
      }),
    /not visible|Unknown app/
  );
});

test("runtime persistence wiring exposes Publish/store service and routes", () => {
  assert.match(appFactory, /publishStorePersistence\?: PublishStoreRepositoryBackedService/);
  assert.match(
    appFactory,
    /createPublishStoreRepositoryBackedService\(\s*new MemoryPublishStorePersistenceClient\(\)\s*\)/
  );
  assert.match(appFactory, /createPrismaPublishStorePersistence\(\s*env\.DATABASE_URL\s*\)/);
  assert.match(appFactory, /isPersistencePublishStoreRoute/);
  assert.match(repositorySource, /appStoreRegistryEntry/);
  assert.match(repositorySource, /supportTicket/);
  assert.match(persistenceDoc, /Publish and App Store Route-Level Coverage/);
});
