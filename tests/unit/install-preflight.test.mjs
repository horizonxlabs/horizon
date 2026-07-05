import assert from "node:assert/strict";
import test from "node:test";

import { evaluateInstallContract, maskSecret, parseComposeServices, redactEnv } from "../../scripts/install/preflight.mjs";

const validEnv = {
  EVCP_ORG_NAME: "Example Enterprise",
  EVCP_BASE_URL: "http://localhost:8080",
  EVCP_HTTP_PORT: "8080",
  EVCP_API_PORT: "3100",
  EVCP_ADMIN_PORT: "4100",
  EVCP_CREATOR_PORT: "4101",
  EVCP_STORE_PORT: "4102",
  DATABASE_URL: "postgresql://evcp:example-postgres-password-change-before-use@postgres:5432/evcp?schema=public",
  EVCP_CORE_PERSISTENCE: "prisma",
  POSTGRES_PASSWORD: "example-postgres-password-change-before-use",
  SESSION_SECRET: "example-session-secret-change-before-use-32chars",
  ENCRYPTION_KEY: "example-encryption-key-change-before-use-32chars",
  FIRST_ADMIN_EMAIL: "admin@example.com",
  KEYCLOAK_ADMIN_PASSWORD: "example-keycloak-password-change-before-use",
  MINIO_ROOT_USER: "evcpminio",
  MINIO_ROOT_PASSWORD: "example-minio-password-change-before-use",
  STORAGE_ENDPOINT: "http://minio:9000",
  STORAGE_ACCESS_KEY: "evcpminio",
  STORAGE_SECRET_KEY: "example-minio-password-change-before-use",
  REDIS_URL: "redis://redis:6379",
  AI_PROVIDER: "openai",
  AI_MODEL: "gpt-4.1-mini",
  AI_API_KEY: "example-ai-api-key-change-before-use",
  BACKUP_BUCKET: "evcp-backups",
  BACKUP_RETENTION_DAYS: "30"
};

const composeText = `
services:
  postgres:
  redis:
  minio:
  keycloak:
  platform-api:
    env_file:
      - ../.env
  admin-web:
  creator-web:
  app-store-pwa:
  caddy:
`;

test("install preflight parses compose service names", () => {
  assert.deepEqual(parseComposeServices(composeText), [
    "postgres",
    "redis",
    "minio",
    "keycloak",
    "platform-api",
    "admin-web",
    "creator-web",
    "app-store-pwa",
    "caddy"
  ]);
});

test("install preflight passes example contract when example secrets are explicitly allowed", () => {
  const report = evaluateInstallContract({ env: validEnv, composeText, allowExampleSecrets: true });
  assert.equal(report.passed, true);
  assert.equal(report.serviceCount, 9);
  assert.ok(report.checks.some((item) => item.name === "env:EVCP_CORE_PERSISTENCE" && item.passed === true));
  assert.ok(report.checks.some((item) => item.name === "env:EVCP_CORE_PERSISTENCE:mode" && item.passed === true));
});

test("install preflight blocks example secrets for real install mode", () => {
  const report = evaluateInstallContract({ env: validEnv, composeText, allowExampleSecrets: false });
  assert.equal(report.passed, false);
  assert.ok(report.checks.some((item) => item.name === "secret:AI_API_KEY" && item.passed === false));
});

test("install preflight redacts secret values", () => {
  assert.equal(maskSecret("abcdefghijklmnopqrstuvwxyz"), "abc...xyz");
  const redacted = redactEnv(validEnv);
  assert.notEqual(redacted.AI_API_KEY, validEnv.AI_API_KEY);
  assert.equal(redacted.EVCP_ORG_NAME, validEnv.EVCP_ORG_NAME);
});
