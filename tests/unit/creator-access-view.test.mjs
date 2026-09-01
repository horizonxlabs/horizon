import assert from "node:assert/strict";
import test from "node:test";

const { createAccessView } =
  await import("../../apps/creator-web/src/features/publish/access-view.ts");

test("an invitation without an expiry uses a readable user-facing fallback", () => {
  const view = createAccessView({
    members: [],
    invitations: [
      {
        id: "invite-1",
        email: "manager@example.com",
        roleKey: "manager",
        userType: "internal",
        status: "pending"
      }
    ],
    accessRequests: [],
    roles: []
  });

  assert.equal(view.visiblePendingInvites[0].expires, "No expiration date");
});
