import test from "node:test";
import assert from "node:assert/strict";
import { runPrePublishChecks } from "../../apps/platform-api/src/publish/pre-publish-checks.ts";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
test("passes when migrations are applied and tree is clean without executing in the dev container", async () => {
  const migrations = createMemoryMigrationStore();
  migrations.recordMigration({ projectId: "p1", name: "001_init", sql: "-- init", commitSha: "s" });
  const git = createMemoryGitPort({
    p1: { clean: true, head: "s", migrationNames: { s: ["001_init"] } }
  });
  const result = await runPrePublishChecks(
    { git, migrations },
    { projectId: "p1", commitSha: "s" }
  );
  assert.deepEqual(result, { ok: true });
});

test("fails and lists migration and clean-tree failures", async () => {
  const migrations = createMemoryMigrationStore();
  migrations.recordMigration({ projectId: "p1", name: "001_init", sql: "-- init", commitSha: "s" });
  const git = createMemoryGitPort({
    p1: { clean: false, head: "s", migrationNames: { s: ["001_init", "002_users"] } }
  });
  const result = await runPrePublishChecks(
    { git, migrations },
    { projectId: "p1", commitSha: "s" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 2);
  assert.ok(result.failures.some((f) => /working tree/i.test(f)));
  assert.ok(result.failures.some((f) => /pending migration/i.test(f) && /002_users/.test(f)));
});
