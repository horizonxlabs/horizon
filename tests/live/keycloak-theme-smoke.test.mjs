import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const realmImport = resolve(repositoryRoot, "apps/platform-api/keycloak/evcp-realm.json");
const uniqueSuffix = `${process.pid}-${randomUUID()}`;
const image = `evcp-keycloak-theme-smoke:${uniqueSuffix}`;
const container = `evcp-keycloak-theme-smoke-${uniqueSuffix}`;

function docker(args, { timeout = 600_000 } = {}) {
  return spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout
  });
}

function requireDockerSuccess(label, result) {
  assert.equal(result.status, 0, `${label} failed\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

async function waitForRealm(baseUrl) {
  const attempts = 90;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/auth/realms/evcp`, {
        signal: AbortSignal.timeout(2_000)
      });
      if (response.status === 200) return;
    } catch {
      // Keycloak may refuse the connection while its HTTP listener is starting.
    }

    if (attempt < attempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
    }
  }

  const logs = docker(["logs", "--tail", "100", container], { timeout: 10_000 });
  assert.fail(
    `Keycloak realm was not ready after ${attempts} attempts\n${logs.stderr || logs.stdout}`
  );
}

test.after(() => {
  docker(["container", "rm", "--force", container], { timeout: 30_000 });
  docker(["image", "rm", "--force", image], { timeout: 60_000 });

  const containerInspection = docker(["container", "inspect", container], {
    timeout: 10_000
  });
  const imageInspection = docker(["image", "inspect", image], { timeout: 10_000 });

  assert.notEqual(containerInspection.status, 0, `Container cleanup failed: ${container}`);
  assert.notEqual(imageInspection.status, 0, `Image cleanup failed: ${image}`);
  console.log(`Cleanup verified for ${container} and ${image}`);
});

test("Horizon renders login and invalid-client pages through real Keycloak", async () => {
  requireDockerSuccess(
    "Keycloak image build",
    docker(["build", "--file", "docker/keycloak.Dockerfile", "--tag", image, "."])
  );

  requireDockerSuccess(
    "Keycloak container start",
    docker([
      "run",
      "--detach",
      "--name",
      container,
      "--publish",
      "127.0.0.1::8080",
      "--env",
      "KC_BOOTSTRAP_ADMIN_USERNAME=theme-smoke-admin",
      "--env",
      `KC_BOOTSTRAP_ADMIN_PASSWORD=local-smoke-${uniqueSuffix}`,
      "--env",
      "KC_HEALTH_ENABLED=true",
      "--env",
      "KC_HTTP_RELATIVE_PATH=/auth",
      "--volume",
      `${realmImport}:/opt/keycloak/data/import/evcp-realm.json:ro`,
      image,
      "start-dev",
      "--import-realm",
      "--http-port=8080",
      "--hostname-strict=false"
    ])
  );

  const hostPort = requireDockerSuccess(
    "Keycloak automatic host port lookup",
    docker(["port", container, "8080/tcp"], { timeout: 10_000 })
  ).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(hostPort, "Docker did not publish an automatic IPv4 host port");

  const baseUrl = `http://127.0.0.1:${hostPort}`;
  await waitForRealm(baseUrl);

  const loginUrl = new URL("/auth/realms/evcp/protocol/openid-connect/auth", baseUrl);
  loginUrl.search = new URLSearchParams({
    client_id: "evcp-platform-api",
    redirect_uri: "http://localhost:3100/auth/keycloak/callback",
    response_type: "code",
    scope: "openid",
    state: "theme-smoke-state",
    nonce: "theme-smoke-nonce"
  });

  const loginResponse = await fetch(loginUrl, { redirect: "follow" });
  const loginHtml = await loginResponse.text();

  assert.equal(loginResponse.status, 200);
  assert.match(loginHtml, /class="horizon-auth-shell"/);
  assert.match(loginHtml, /Build securely\./);
  assert.match(loginHtml, /action="[^"]*\/login-actions\/authenticate/);

  const stylesheetHref = loginHtml.match(
    /href="([^"]*\/resources\/[^"]*\/login\/horizon\/css\/horizon-login\.css)"/
  )?.[1];
  assert.ok(stylesheetHref, "Login page did not reference the Horizon theme stylesheet");

  const stylesheetResponse = await fetch(new URL(stylesheetHref, baseUrl));
  assert.equal(stylesheetResponse.status, 200);
  assert.match(await stylesheetResponse.text(), /\.horizon-auth-shell/);

  const invalidClientUrl = new URL(loginUrl);
  invalidClientUrl.searchParams.set("client_id", "unknown-theme-smoke-client");
  const errorResponse = await fetch(invalidClientUrl, { redirect: "follow" });
  const errorHtml = await errorResponse.text();

  assert.ok(errorResponse.status >= 400 || errorResponse.status === 200);
  assert.match(errorHtml, /class="horizon-auth-shell"/);
  assert.match(errorHtml, /We couldn&#39;t continue/);
  assert.match(errorHtml, /Client not found\./i);
  assert.doesNotMatch(errorHtml, /Exception|stack trace|client_secret/i);
});
