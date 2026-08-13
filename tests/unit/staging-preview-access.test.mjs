import test from "node:test";
import assert from "node:assert/strict";

const { deploymentUrl } =
  await import("../../apps/creator-web/src/features/publish/deployment-url.ts");
test("deploymentUrl creates public browser links for both deployment environments", () => {
  assert.equal(
    deploymentUrl("prj-123", "staging", "http://localhost:8088"),
    "http://localhost:8088/apps/prj-123/staging"
  );
  assert.equal(
    deploymentUrl("prj-123", "production", "http://localhost:8088"),
    "http://localhost:8088/apps/prj-123"
  );
});
