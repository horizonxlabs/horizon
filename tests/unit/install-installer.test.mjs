import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const preflight = await import("../../scripts/install/preflight.mjs");
const installer = await import("../../scripts/install/installer.mjs");

test("installer state machine runs all dry-run stages and writes redacted report", () => {
  const reportDir = mkdtempSync(join(tmpdir(), "evcp-installer-"));
  try {
    const report = installer.runInstaller({
      envPath: ".env.example",
      composePath: "docker/docker-compose.yml",
      reportDir,
      dryRun: true,
      allowExampleSecrets: true
    });
    const reportText = readFileSync(report.reportPath, "utf8");

    assert.equal(report.status, "passed");
    assert.deepEqual(report.stages.map((stage) => stage.name), ["preflight", "configure", "write_config_evidence", "deploy_compose", "migrate_seed", "verify_health"]);
    assert.equal(report.stages.every((stage) => stage.status === "passed"), true);
    assert.equal(report.composeReadiness.every((service) => service.status === "ready"), true);
    assert.match(report.setupEvidence.database.urlMasked, /\*\*\*/);
    assert.equal(report.setupEvidence.ai.management, "admin_openbao");
    assert.equal(report.setupEvidence.ai.providerCredentialsInEnvironment, false);
    assert.equal(reportText.includes("example-openai-key-change-before-use"), false);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
});

test("installer blocks example secrets in real mode contract", () => {
  const env = preflight.loadEnvFile(".env.example");
  const composeText = readFileSync("docker/docker-compose.yml", "utf8");
  const report = installer.buildInstallReport({
    env,
    composeText,
    options: {
      envPath: ".env.example",
      composePath: "docker/docker-compose.yml",
      reportDir: ".evcp/install-reports",
      dryRun: true,
      allowExampleSecrets: false
    },
    startedAt: "2026-07-04T00:00:00.000Z"
  });

  assert.equal(report.status, "failed");
  assert.equal(report.stages[0].name, "preflight");
  assert.equal(report.stages[0].status, "failed");
  assert.ok(report.actionableFailures.some((failure) => failure.includes("secret:EVCP_AI_JOB_ENCRYPTION_KEY")));
  assert.equal(JSON.stringify(report).includes("example-openai-key-change-before-use"), false);
});

test("installer setup evidence captures install inputs without raw secrets", () => {
  const evidence = installer.buildSetupEvidence({
    EVCP_ORG_NAME: "ACME",
    EVCP_BASE_URL: "https://platform.acme.test",
    EVCP_PUBLIC_DOMAIN: "platform.acme.test",
    EVCP_HTTP_PORT: "80",
    EVCP_HTTPS_PORT: "443",
    EVCP_API_PORT: "3100",
    EVCP_ADMIN_PORT: "4100",
    EVCP_CREATOR_PORT: "4101",
    EVCP_STORE_PORT: "4102",
    DATABASE_URL: "postgresql://evcp:super-secret-db@postgres:5432/evcp",
    POSTGRES_PASSWORD: "super-secret-db",
    STORAGE_ENDPOINT: "https://storage.acme.test",
    MINIO_BUCKET: "evcp-artifacts",
    STORAGE_ACCESS_KEY: "storage-access",
    STORAGE_SECRET_KEY: "storage-secret",
    KEYCLOAK_REALM: "evcp",
    KEYCLOAK_ADMIN: "admin",
    KEYCLOAK_ADMIN_PASSWORD: "keycloak-secret",
    VAULT_ADDR: "https://openbao.acme.test",
    VAULT_TOKEN_FILE: "/run/secrets/evcp-vault-token",
    BACKUP_BUCKET: "backups",
    BACKUP_RETENTION_DAYS: "30",
    BACKUP_ENCRYPTION_KEY_REF: "kms://backup",
    FIRST_ADMIN_EMAIL: "admin@acme.test",
    FIRST_ADMIN_NAME: "Platform Admin"
  });

  const serialized = JSON.stringify(evidence);
  assert.equal(evidence.network.tlsMode, "caddy_tls");
  assert.match(evidence.database.passwordFingerprint, /^sha256:/);
  assert.match(evidence.storage.secretKeyFingerprint, /^sha256:/);
  assert.match(evidence.auth.adminPasswordFingerprint, /^sha256:/);
  assert.equal(serialized.includes("super-secret-db"), false);
  assert.equal(serialized.includes("storage-secret"), false);
  assert.equal(serialized.includes("keycloak-secret"), false);
  assert.equal(evidence.ai.management, "admin_openbao");
  assert.equal(evidence.ai.providerCredentialsInEnvironment, false);
});

test("installer evidence fingerprints master and encryption credentials", () => {
  const redacted = installer.redactDeep({
    litellmMasterKey: "litellm-master-key-value",
    workspaceEncryptionKey: "workspace-encryption-key-value",
    publicDomain: "pilot.example.test"
  });

  assert.match(redacted.litellmMasterKeyFingerprint, /^sha256:/);
  assert.match(redacted.workspaceEncryptionKeyFingerprint, /^sha256:/);
  assert.equal(redacted.publicDomain, "pilot.example.test");
  assert.equal(JSON.stringify(redacted).includes("master-key-value"), false);
  assert.equal(JSON.stringify(redacted).includes("encryption-key-value"), false);
});
