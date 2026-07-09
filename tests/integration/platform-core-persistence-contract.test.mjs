import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");
const repositories = readFileSync("apps/platform-api/src/persistence/core-repositories.ts", "utf8");

test("core persistence contract matches Prisma user project and audit models", () => {
  for (const model of [
    "model PlatformUser",
    "model PlatformRole",
    "model PlatformUserRole",
    "model Project",
    "model AuditLog"
  ]) {
    assert.match(schema, new RegExp(model));
  }

  assert.match(schema, /roles\s+PlatformUserRole\[\]/);
  assert.match(schema, /ownerUserId String\s+@map\("owner_user_id"\)/);
  assert.match(schema, /metadata\s+Json\s+@default\("\{\}"\)/);
  assert.match(schema, /@@index\(\[actorUserId, occurredAt\]\)/);
});

test("core persistence repository uses Prisma delegate names and relation includes", () => {
  for (const delegate of ["platformUser", "project", "auditLog"]) {
    assert.match(repositories, new RegExp(`${delegate}:`));
  }

  assert.match(repositories, /roles: \{ include: \{ role: true \} \}/);
  assert.match(repositories, /project\.create/);
  assert.match(repositories, /auditLog\.create/);
  assert.match(repositories, /createPrismaCorePersistence/);
  assert.match(repositories, /MemoryCorePersistenceClient/);
});

test("seed data can hydrate repository-backed core flow", () => {
  assert.match(seed, /platformRole\.upsert/);
  assert.match(seed, /platformUser\.upsert/);
  assert.match(seed, /platformUserRole\.upsert/);
  assert.match(seed, /project\.upsert/);
  assert.match(seed, /auditLog\.upsert/);
  assert.match(seed, /creator@company\.com/);
});
