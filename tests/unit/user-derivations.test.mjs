import test from "node:test";
import assert from "node:assert/strict";

const load = () => import("../../apps/admin-web/src/features/user-management/lib/user-derivations.ts");

function user(overrides = {}) {
  return { id: "u1", email: "user@example.com", name: "User", enabled: true, groups: [], ...overrides };
}

test("roleOf maps evcp-admins group to admin", async () => {
  const { roleOf } = await load();
  assert.equal(roleOf(user({ groups: ["evcp-admins"] })), "admin");
});

test("roleOf maps evcp-users group to end_user", async () => {
  const { roleOf } = await load();
  assert.equal(roleOf(user({ groups: ["evcp-users"] })), "end_user");
});

test("roleOf defaults to creator for any other group set", async () => {
  const { roleOf } = await load();
  assert.equal(roleOf(user({ groups: [] })), "creator");
  assert.equal(roleOf(user({ groups: ["some-other-group"] })), "creator");
});

test("roleOf prefers admin over end_user when a user is in both groups", async () => {
  const { roleOf } = await load();
  assert.equal(roleOf(user({ groups: ["evcp-users", "evcp-admins"] })), "admin");
});

test("roleCounts tallies total and per-role counts", async () => {
  const { roleCounts } = await load();
  const users = [
    user({ id: "1", groups: ["evcp-admins"] }),
    user({ id: "2", groups: ["evcp-users"] }),
    user({ id: "3", groups: [] }),
    user({ id: "4", groups: [] })
  ];
  assert.deepEqual(roleCounts(users), { total: 4, admin: 1, creator: 2, end_user: 1 });
});

test("roleCounts returns zeros for an empty list", async () => {
  const { roleCounts } = await load();
  assert.deepEqual(roleCounts([]), { total: 0, admin: 0, creator: 0, end_user: 0 });
});
