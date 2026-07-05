import { success } from "@evcp/api-client";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} from "../../apps/platform-api/src/persistence/core-repositories.ts";

test("repository-backed core flow can create list and audit project through API envelope", async () => {
  const service = createCoreRepositoryBackedService(new MemoryCorePersistenceClient());
  const actor = await service.getUserByEmail("creator@company.com");

  const project = await service.createProject({
    actor,
    name: "Vendor Onboarding",
    slug: "vendor-onboarding",
    businessProblem: "Procurement needs a private workflow to qualify vendors.",
    targetDepartment: "Procurement",
    intendedUsers: ["Requester", "Approver", "Vendor Manager"],
    dataSensitivity: "confidential"
  });
  const audit = await service.recordAudit({
    actorId: actor.id,
    action: "project.created",
    resourceType: "project",
    resourceId: project.id,
    metadata: { projectId: project.id, slug: project.slug }
  });
  const projects = await service.listProjects(actor);
  const auditEvents = await service.filterAudit({ actorId: actor.id, projectId: project.id });

  const response = success({ project, projects, audit, auditEvents }, { persistence: "core-repository-backed" });

  assert.equal(response.ok, true);
  assert.equal(response.meta.persistence, "core-repository-backed");
  assert.equal(response.data.project.id, "prj_vendor_onboarding");
  assert.equal(response.data.projects.length, 1);
  assert.equal(response.data.audit.resourceId, project.id);
  assert.equal(response.data.auditEvents.length, 1);
  assert.equal(response.data.auditEvents[0].metadata.slug, "vendor-onboarding");
});
