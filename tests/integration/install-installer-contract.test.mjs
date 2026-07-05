import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const preflight = await import("../../scripts/install/preflight.mjs");
const installer = await import("../../scripts/install/installer.mjs");

test("installer report contract includes stable stages setup evidence and retry hints", () => {
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
      allowExampleSecrets: true
    },
    startedAt: "2026-07-04T00:00:00.000Z"
  });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.status, "passed");
  assert.equal(report.stages.length, 6);
  assert.ok(report.stages.every((stage) => typeof stage.retryable === "boolean"));
  assert.deepEqual(Object.keys(report.setupEvidence), ["organization", "network", "database", "storage", "auth", "ai", "guardrail", "backup", "firstAdmin"]);
  assert.deepEqual(report.composeReadiness.map((service) => service.name), ["platform-api", "admin-web", "creator-web", "app-store-pwa", "postgres", "redis", "minio", "keycloak", "caddy"]);
});

test("installer compose readiness fails when required private-server service is missing", () => {
  const env = preflight.loadEnvFile(".env.example");
  const composeText = readFileSync("docker/docker-compose.yml", "utf8").replace("\n  caddy:\n", "\n  missing-caddy:\n");
  const report = installer.buildInstallReport({
    env,
    composeText,
    options: {
      envPath: ".env.example",
      composePath: "docker/docker-compose.yml",
      reportDir: ".evcp/install-reports",
      dryRun: true,
      allowExampleSecrets: true
    },
    startedAt: "2026-07-04T00:00:00.000Z"
  });

  assert.equal(report.status, "failed");
  assert.equal(report.composeReadiness.find((service) => service.name === "caddy").status, "missing");
  assert.ok(report.actionableFailures.some((failure) => failure.includes("compose:caddy")));
});
