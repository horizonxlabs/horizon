import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync("apps/platform-api/prisma/migrations/20260703000008_sprint9_auth_policy_hardening/migration.sql", "utf8");
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 9 Prisma schema defines auth provider session break-glass and policy models", () => {
  for (const model of ["AuthProviderConfig", "PlatformAuthSession", "BreakGlassSession", "PolicyTemplate"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  assert.match(schema, /authProviderConfigs\s+AuthProviderConfig/);
  assert.match(schema, /platformAuthSessions\s+PlatformAuthSession/);
  assert.match(schema, /breakGlassSessions\s+BreakGlassSession/);
  assert.match(schema, /policyTemplates\s+PolicyTemplate/);
});

test("Sprint 9 migration creates auth and policy hardening tables", () => {
  for (const table of ["auth_provider_configs", "platform_auth_sessions", "break_glass_sessions", "policy_templates"]) {
    assert.match(migration, new RegExp(table));
  }

  for (const column of [
    "provider_type",
    "client_secret_fingerprint",
    "certificate_fingerprint",
    "group_role_mapping",
    "session_token_hash",
    "ttl_minutes",
    "required_reviewers",
    "required_checks"
  ]) {
    assert.match(migration, new RegExp(column));
  }
});

test("Sprint 9 seed includes auth providers sessions break-glass and policy templates", () => {
  for (const token of [
    "authProviderConfig",
    "platformAuthSession",
    "breakGlassSession",
    "policyTemplate",
    "authprov_keycloak_default_001",
    "authprov_oidc_azure_ad_001",
    "authprov_saml_okta_001",
    "psess_sprint9_oidc_001",
    "breakglass_sprint9_001",
    "policy_restricted_default"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});

test("Keycloak provider seed runs even when demo project seeding is disabled", () => {
  const providerSeed = seed.indexOf("await seedKeycloakProvider();");
  const demoGate = seed.indexOf('if (process.env.EVCP_SEED_DEMO_PROJECT !== "1") return;');
  assert.ok(providerSeed >= 0);
  assert.ok(demoGate > providerSeed, "provider configuration must be seeded before the demo-only return");
});
