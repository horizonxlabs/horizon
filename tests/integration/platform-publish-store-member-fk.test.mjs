import assert from "node:assert/strict";
import test from "node:test";

const {
  MemoryPublishStorePersistenceClient,
  createPublishStoreRepositoryBackedService
} = await import("../../apps/platform-api/src/persistence/publish-store-repositories.ts");

const creator = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["project:create"]
};
const project = {
  id: "prj_member_fk",
  name: "Member FK",
  status: "draft",
  ownerUserId: creator.id,
  appType: "Workflow App",
  businessProblem: "Keep app membership valid",
  targetDepartment: "Operations",
  intendedUsers: ["Employees"],
  dataSensitivity: "internal",
  appId: "app_member_fk",
  createdAt: "2026-08-07T00:00:00.000Z"
};

test("default app membership contains only the persisted project owner", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient()
  );

  const snapshot = await service.getAppAccessSnapshot(creator, { project });

  assert.deepEqual(
    snapshot.members.map((member) => ({ userId: member.userId, email: member.email })),
    [{ userId: creator.id, email: creator.email }]
  );
});

test("approved access resolves the persisted user by email before creating app membership", async () => {
  const service = createPublishStoreRepositoryBackedService(
    new MemoryPublishStorePersistenceClient()
  );
  await service.getAppAccessSnapshot(creator, { project });
  const request = await service.createAccessRequest(creator, {
    project,
    requesterEmail: "user@company.com",
    requestedRoleKey: "employee",
    reason: "Use the published app"
  });

  await service.decideAccessRequest(creator, {
    project,
    requestId: request.id,
    decision: "approved"
  });
  const snapshot = await service.getAppAccessSnapshot(creator, { project });

  assert.ok(snapshot.members.some((member) =>
    member.userId === "usr_end_user" && member.email === "user@company.com"
  ));
});
