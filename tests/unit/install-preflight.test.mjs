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
  EVCP_S3_PUBLIC_URL: "https://storage.localhost",
  VAULT_ADDR: "http://openbao:8200",
  VAULT_TOKEN_FILE: "/run/secrets/evcp-vault-token",
  EVCP_WORKSPACE_SECRET_KEY: "example-workspace-encryption-key-change-before-use",
  EVCP_AI_JOB_ENCRYPTION_KEY: "example-ai-job-encryption-key-change-before-use",
  LITELLM_MASTER_KEY: "example-litellm-master-key-change-before-use",
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
  assert.ok(report.checks.some((item) => item.name === "secret:EVCP_AI_JOB_ENCRYPTION_KEY" && item.passed === false));
});

test("install preflight redacts secret values", () => {
  assert.equal(maskSecret("abcdefghijklmnopqrstuvwxyz"), "abc...xyz");
  const redacted = redactEnv(validEnv);
  assert.notEqual(redacted.EVCP_AI_JOB_ENCRYPTION_KEY, validEnv.EVCP_AI_JOB_ENCRYPTION_KEY);
  assert.equal(redacted.EVCP_ORG_NAME, validEnv.EVCP_ORG_NAME);
});

test("install preflight redacts provider, token, and encryption credentials", () => {
  const credentials = {
    ANTHROPIC_API_KEY: "anthropic-provider-key-value",
    OPENAI_API_KEY: "openai-provider-key-value",
    LITELLM_MASTER_KEY: "litellm-master-key-value",
    EVCP_WORKSPACE_SECRET_KEY: "workspace-secret-key-value",
    EVCP_AI_JOB_ENCRYPTION_KEY: "ai-job-encryption-key-value",
    VAULT_TOKEN: "openbao-token-value",
    VAULT_TOKEN_FILE: "/run/secrets/openbao-token",
    EVCP_PUBLIC_DOMAIN: "pilot.example.test"
  };

  const redacted = redactEnv(credentials);
  for (const key of Object.keys(credentials).filter((key) => key !== "EVCP_PUBLIC_DOMAIN")) {
    assert.notEqual(redacted[key], credentials[key], `${key} must not be exposed`);
  }
  assert.equal(redacted.EVCP_PUBLIC_DOMAIN, credentials.EVCP_PUBLIC_DOMAIN);
});
