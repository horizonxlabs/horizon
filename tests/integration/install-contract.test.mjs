import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { evaluateInstallContract, loadEnvFile, parseComposeServices } from "../../scripts/install/preflight.mjs";

test("real MVP install contract declares required private-server services", () => {
  const composeText = readFileSync("docker/docker-compose.yml", "utf8");
  const services = parseComposeServices(composeText);
  for (const service of ["postgres", "redis", "minio", "keycloak", "platform-api", "admin-web", "creator-web", "app-store-pwa", "caddy"]) {
    assert.ok(services.includes(service), `missing compose service ${service}`);
  }
});

test("checked-in environment template passes contract mode without leaking plaintext secrets", () => {
  const env = loadEnvFile(".env.example");
  const composeText = readFileSync("docker/docker-compose.yml", "utf8");
  const report = evaluateInstallContract({ env, composeText, envPath: ".env.example", allowExampleSecrets: true });
  assert.equal(report.passed, true);
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(env.AI_API_KEY), "AI API key must be redacted");
  assert.ok(!serialized.includes(env.POSTGRES_PASSWORD), "database password must be redacted");
});

test("checked-in environment template defaults the workspace warm pool to three slots", () => {
  const env = loadEnvFile(".env.example");
  assert.equal(env.EVCP_WORKSPACE_WARM_POOL_SIZE, "3");
});

test("docker compose no longer hardcodes the old default database password", () => {
  const composeText = readFileSync("docker/docker-compose.yml", "utf8");
  assert.ok(!composeText.includes("POSTGRES_PASSWORD: evcp"));
  assert.ok(composeText.includes("${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"));
});
