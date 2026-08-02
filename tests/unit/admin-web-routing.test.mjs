import assert from "node:assert/strict";
import test from "node:test";

const { adminPageFromPath } =
  await import("../../apps/admin-web/src/features/admin-console/admin-routes.ts");

test("Admin route resolver recognizes every configured page", () => {
  assert.equal(adminPageFromPath("/admin"), "dashboard");
  assert.equal(adminPageFromPath("/admin/services"), "services");
  assert.equal(adminPageFromPath("/admin/ai-providers"), "ai-providers");
  assert.equal(adminPageFromPath("/admin/guardrails"), "guardrails");
  assert.equal(adminPageFromPath("/admin/knowledge"), "knowledge");
  assert.equal(adminPageFromPath("/admin/audit-logs"), "audit-logs");
  assert.equal(adminPageFromPath("/admin/users"), "users");
  assert.equal(adminPageFromPath("/admin/auth"), "auth");
  assert.equal(adminPageFromPath("/admin/domains"), "domains");
  assert.equal(adminPageFromPath("/admin/publishing"), "publishing");
  assert.equal(adminPageFromPath("/admin/unknown"), "not-found");
});
