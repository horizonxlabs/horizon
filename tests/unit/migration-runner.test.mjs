import assert from "node:assert/strict";
import test from "node:test";
import { buildTransactionalMigrationSql } from "../../apps/platform-api/src/generation-loop/migration-runner.ts";

test("generated migration SQL is atomic and scoped to the project schema", () => {
  const sql = buildTransactionalMigrationSql(
    "postgresql://role:secret@postgres/evcp?schema=app_project_a",
    "CREATE TABLE users(id text)"
  );
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /SET LOCAL search_path TO "app_project_a"/);
  assert.match(sql, /CREATE TABLE users/);
  assert.match(sql, /COMMIT;$/);
});
