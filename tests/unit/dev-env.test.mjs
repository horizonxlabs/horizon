import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ensureLocalEnv, renderLocalEnv } from "../../scripts/dev/create-env.mjs";
import { loadEnvFile } from "../../scripts/install/preflight.mjs";

const template = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");

test("renderLocalEnv creates correlated, non-example development secrets", () => {
  let counter = 0;
  const rendered = renderLocalEnv(template, (bytes) =>
    (++counter).toString(16).padStart(bytes * 2, String(counter % 10))
  );
  const directory = mkdtempSync(join(tmpdir(), "evcp-env-render-"));
  const envPath = join(directory, ".env");
  writeFileSync(envPath, rendered);

  try {
    const env = loadEnvFile(envPath);
    for (const key of [
      "POSTGRES_PASSWORD",
      "SESSION_SECRET",
      "ENCRYPTION_KEY",
      "KEYCLOAK_ADMIN_PASSWORD",
      "KEYCLOAK_PLATFORM_CLIENT_SECRET",
      "KEYCLOAK_ADMIN_CLIENT_SECRET",
      "MINIO_ROOT_PASSWORD",
      "STORAGE_SECRET_KEY",
      "LITELLM_MASTER_KEY",
      "EVCP_WORKSPACE_SECRET_KEY",
      "EVCP_AI_JOB_ENCRYPTION_KEY"
    ]) {
      assert.doesNotMatch(env[key], /example|change-before-use|change-me/i, key);
    }
    assert.equal(
      env.DATABASE_URL,
      `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@postgres:5432/${env.POSTGRES_DB}?schema=public`
    );
    assert.equal(
      env.LITELLM_DATABASE_URL,
      `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@postgres:5432/litellm`
    );
    assert.equal(env.STORAGE_ACCESS_KEY, env.MINIO_ROOT_USER);
    assert.equal(env.STORAGE_SECRET_KEY, env.MINIO_ROOT_PASSWORD);
    assert.match(env.EVCP_WORKSPACE_SECRET_KEY, /^[a-f0-9]{64}$/);
    assert.match(env.LITELLM_MASTER_KEY, /^sk-[a-f0-9]{48}$/);
    assert.match(env.COMPOSE_PROJECT_NAME, /^evcp-local-[a-f0-9]{8}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ensureLocalEnv creates .env once and never overwrites an existing file", () => {
  const directory = mkdtempSync(join(tmpdir(), "evcp-env-create-"));
  writeFileSync(join(directory, ".env.example"), template);

  try {
    const first = ensureLocalEnv(directory, { randomHex: (bytes) => "a".repeat(bytes * 2) });
    assert.equal(first.created, true);
    const generated = readFileSync(join(directory, ".env"), "utf8");

    writeFileSync(join(directory, ".env"), `${generated}\nCUSTOM_VALUE=keep-me\n`);
    const second = ensureLocalEnv(directory, { randomHex: (bytes) => "b".repeat(bytes * 2) });
    assert.equal(second.created, false);
    assert.equal(second.repaired, false);
    assert.match(readFileSync(join(directory, ".env"), "utf8"), /CUSTOM_VALUE=keep-me/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ensureLocalEnv repairs copied example secrets while preserving real and custom values", () => {
  const directory = mkdtempSync(join(tmpdir(), "evcp-env-repair-"));
  const realSessionSecret = "real-session-secret-that-must-be-preserved";
  const copiedExample = template.replace(
    /^SESSION_SECRET=.*$/m,
    `SESSION_SECRET=${realSessionSecret}`
  );
  writeFileSync(join(directory, ".env.example"), template);
  writeFileSync(join(directory, ".env"), `${copiedExample}\nCUSTOM_VALUE=keep-me\n`);

  try {
    const result = ensureLocalEnv(directory, {
      randomHex: (bytes) => "c".repeat(bytes * 2)
    });
    const env = loadEnvFile(join(directory, ".env"));

    assert.equal(result.created, false);
    assert.equal(result.repaired, true);
    assert.equal(env.SESSION_SECRET, realSessionSecret);
    assert.equal(env.CUSTOM_VALUE, "keep-me");
    assert.equal(
      env.DATABASE_URL,
      `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@postgres:5432/${env.POSTGRES_DB}?schema=public`
    );
    assert.equal(
      env.LITELLM_DATABASE_URL,
      `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@postgres:5432/litellm`
    );
    assert.equal(env.STORAGE_SECRET_KEY, env.MINIO_ROOT_PASSWORD);
    assert.match(env.EVCP_WORKSPACE_SECRET_KEY, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(env.LITELLM_MASTER_KEY, /example|change-me/i);
    assert.match(env.COMPOSE_PROJECT_NAME, /^evcp-local-[a-f0-9]{8}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
