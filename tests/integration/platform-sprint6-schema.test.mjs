import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000005_sprint6_users_publish/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 6 Prisma schema defines app invitation access request manifest deployment and registry models", () => {
  for (const model of [
    "AppInvitation",
    "AppAccessRequest",
    "AppManifest",
    "PublishRequest",
    "DeploymentRecord",
    "AppStoreRegistryEntry"
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }

  assert.match(schema, /invitations\s+AppInvitation/);
  assert.match(schema, /accessRequests\s+AppAccessRequest/);
  assert.match(schema, /manifest\s+AppManifest/);
  assert.match(schema, /registryEntry\s+AppStoreRegistryEntry/);
});

test("Sprint 6 migration creates publish and app access tables", () => {
  for (const table of [
    "app_invitations",
    "app_access_requests",
    "app_manifests",
    "publish_requests",
    "deployment_records",
    "app_store_registry_entries"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }

  assert.match(migration, /approval_required/);
  assert.match(migration, /manifest_version/);
  assert.match(migration, /frontend_checkpoint_id/);
});

test("Sprint 6 seed includes access and publish demo data for Leave Management", () => {
  for (const token of [
    "appInvitation",
    "appAccessRequest",
    "appManifest",
    "publishRequest",
    "deploymentRecord",
    "appStoreRegistryEntry",
    "app_role_leave_manager",
    "app_role_leave_hr_admin",
    "dep_leave_management_001"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
