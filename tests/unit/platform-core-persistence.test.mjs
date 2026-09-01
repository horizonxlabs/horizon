import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/core-repositories.ts";

test("core persistence maps Prisma-shaped users with roles and permissions", async () => {
  const service = createCoreRepositoryBackedService(new MemoryCorePersistenceClient());

  const creator = await service.getUserByEmail("creator@company.com");

  assert.equal(creator.id, "usr_creator");
  assert.equal(creator.role, "creator");
  assert.equal(creator.status, "active");
  assert.deepEqual(creator.permissions, ["project:create", "project:update", "app:publish-request", "ticket:manage"]);
});

test("core persistence creates and upserts projects scoped by actor", async () => {
  const service = createCoreRepositoryBackedService(new MemoryCorePersistenceClient());
  const creator = await service.getUserByEmail("creator@company.com");
  const admin = await service.getUserByEmail("admin@company.com");

  const created = await service.createProject({
    actor: creator,
    name: "Expense Approval",
    appType: "Workflow App",
    businessProblem: "Finance needs an approval workflow.",
    targetDepartment: "Finance",
    intendedUsers: ["Employee", "Manager", "Finance Admin"],
    dataSensitivity: "confidential"
  });
  const second = await service.createProject({
    actor: creator,
    name: "Expense Approval v2",
    dataSensitivity: "restricted"
  });

  assert.match(created.id, /^prj_[0-9a-f]{32}$/);
  assert.match(second.id, /^prj_[0-9a-f]{32}$/);
  assert.notEqual(created.id, second.id);
  assert.equal(second.name, "Expense Approval v2");
  assert.equal(second.ownerUserId, creator.id);
  assert.equal(second.dataSensitivity, "restricted");
  assert.equal((await service.listProjects(creator)).length, 2);
  assert.equal((await service.listProjects(admin)).length, 2);
});

test("core persistence denies end users from project creation", async () => {
  const service = createCoreRepositoryBackedService(new MemoryCorePersistenceClient());
  const endUser = await service.getUserByEmail("user@company.com");

  await assert.rejects(
    () => service.createProject({ actor: endUser, name: "Blocked" }),
    /cannot create projects/
  );
});

test("core persistence deletes a project for its owner and keeps it for another creator", async () => {
  const service = createCoreRepositoryBackedService(new MemoryCorePersistenceClient());
  const owner = await service.getUserByEmail("creator@company.com");
  const otherCreator = { ...owner, id: "usr_other_creator", email: "other@company.com" };
  const project = await service.createProject({ actor: owner, name: "Delete Me" });

  await assert.rejects(() => service.deleteProject(otherCreator, project.id), /cannot delete project/);
  assert.equal((await service.listProjects(owner)).length, 1);

  await service.deleteProject(owner, project.id);
  assert.deepEqual(await service.listProjects(owner), []);
});

test("core persistence records and filters audit events", async () => {
  const service = createCoreRepositoryBackedService(new MemoryCorePersistenceClient());
  const creator = await service.getUserByEmail("creator@company.com");
  const project = await service.createProject({ actor: creator, name: "Leave Extension" });

  await service.recordAudit({
    actorId: creator.id,
    action: "project.created",
    resourceType: "project",
    resourceId: project.id,
    severity: "info",
    metadata: { projectId: project.id }
  });
  await service.recordAudit({
    actorId: creator.id,
    action: "project.security_reviewed",
    resourceType: "project",
    resourceId: project.id,
    severity: "warning",
    metadata: { projectId: project.id }
  });

  const createdEvents = await service.filterAudit({ actorId: creator.id, action: "project.created", projectId: project.id });
  const warningEvents = await service.filterAudit({ severity: "warning", projectId: project.id });

  assert.equal(createdEvents.length, 1);
  assert.equal(createdEvents[0].metadata.projectId, project.id);
  assert.equal(warningEvents.length, 1);
  assert.equal(warningEvents[0].action, "project.security_reviewed");
});
