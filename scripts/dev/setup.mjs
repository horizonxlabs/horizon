#!/usr/bin/env node
// Idempotent dev bootstrap: bring up the full containerized stack from
// docker/docker-compose.yml with one command. Prisma migrate/generate/seed run inside
// the platform-api container on start, so this script only starts the stack and waits
// for the slow services (Keycloak, platform-api) to become reachable.
// Run once after clone, safe to re-run.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ensureLocalEnv } from "./create-env.mjs";
import { runStartupCommands } from "./setup-runner.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Read a host port from .env so readiness checks + the printed URLs match the actual mapping
// (the ports are configurable — e.g. moved into the 98xx range to dodge local collisions).
function envPort(key, fallback) {
  try {
    const line = readFileSync(resolve(root, ".env"), "utf8")
      .split("\n")
      .find((entry) => entry.startsWith(`${key}=`));
    const value = line?.slice(key.length + 1).trim();
    return value && /^\d+$/.test(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function dockerInspect(name, format) {
  const r = spawnSync("docker", ["inspect", `--format=${format}`, name]);
  return r.status === 0 ? r.stdout.toString().trim() : null;
}

async function httpOk(url) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(3_000)
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function waitFor(label, checkFn, timeoutMs = 60_000) {
  process.stdout.write(`Waiting for ${label}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkFn()) {
      console.log(" ✓");
      return;
    }
    process.stdout.write(".");
    await new Promise((res) => setTimeout(res, 2000));
  }
  console.log(" ✗");
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s`);
}

// ── 1. Generate local config, preflight, then start the whole stack ───────────
runStartupCommands({
  ensureEnv: () => {
    const result = ensureLocalEnv(root);
    if (result.created) console.log("Created .env with generated local development secrets.");
    if (result.repaired) {
      console.log("Replaced example secrets in .env while preserving existing real values.");
    }
  },
  runPreflight: () => {
    console.log("Validating local tools and configuration...");
    execFileSync(
      process.execPath,
      [
        "scripts/install/preflight.mjs",
        "--env",
        ".env",
        "--compose",
        "docker/docker-compose.yml",
        "--live",
        "--text"
      ],
      { cwd: root, stdio: "inherit" }
    );
  },
  prepareCompose: () => {
    // Older revisions used a fixed Compose project. Remove only its replaceable
    // containers/network so generated credentials can start against clean, project-scoped
    // volumes. The legacy data volumes are deliberately retained for recovery.
    execFileSync(
      "docker",
      [
        "compose",
        "--project-name",
        "evcp-private-server",
        "--env-file",
        ".env",
        "-f",
        "docker/docker-compose.yml",
        "down",
        "--remove-orphans"
      ],
      { cwd: root, stdio: "inherit" }
    );
  },
  startCompose: () => {
    console.log("Starting full dev stack (docker/docker-compose.yml)...");
    execFileSync(
      "docker",
      ["compose", "--env-file", ".env", "-f", "docker/docker-compose.yml", "up", "-d"],
      { cwd: root, stdio: "inherit" }
    );
  }
});

const appPort = envPort("EVCP_HTTP_PORT", "9800");
const apiPort = envPort("EVCP_API_PORT", "9801");
const keycloakPort = envPort("EVCP_KEYCLOAK_HOST_PORT", "9805");
const minioConsolePort = envPort("EVCP_S3_CONSOLE_HOST_PORT", "9807");

// ── 2. Wait for Keycloak (~60-90 s on first run) ─────────────────────────────
await waitFor(
  "Keycloak (may take ~90 s on first run)",
  () => dockerInspect("evcp-keycloak", "{{.State.Health.Status}}") === "healthy",
  180_000
);

// ── 3. Wait for keycloak-bootstrap to complete ────────────────────────────────
await waitFor(
  "Keycloak client bootstrap",
  () => dockerInspect("evcp-keycloak-bootstrap", "{{.State.Status}}") === "exited",
  60_000
);

const bsExit = dockerInspect("evcp-keycloak-bootstrap", "{{.State.ExitCode}}");
if (bsExit !== "0") {
  throw new Error(
    `keycloak-bootstrap exited with code ${bsExit}. Check logs: docker logs evcp-keycloak-bootstrap`
  );
}

// ── 4. Wait for platform-api (installs deps + migrates + seeds in-container) ──
await waitFor(
  "platform-api (installs deps, migrates & seeds on first run)",
  () => httpOk(`http://localhost:${apiPort}/health`) || httpOk(`http://localhost:${apiPort}`),
  300_000
);

// ── 5. Verify the actual browser entry points through Caddy ───────────────────
await waitFor(
  "Caddy and browser surfaces",
  async () =>
    (await httpOk(`http://localhost:${appPort}/admin`)) &&
    (await httpOk(`http://localhost:${appPort}/creator/`)) &&
    (await httpOk(`http://localhost:${appPort}/store/`)) &&
    (await httpOk(`http://localhost:${appPort}/api/health`)),
  300_000
);

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n✓ Dev stack up — everything runs in containers with hot reload.");
console.log(`  App (via Caddy): http://localhost:${appPort}  (/admin · /creator · /store · /api)`);
console.log(`  API:             http://localhost:${apiPort}`);
console.log(
  `  Keycloak:        http://localhost:${keycloakPort}/auth  (admin / see KEYCLOAK_ADMIN_PASSWORD)`
);
console.log(`  MinIO console:   http://localhost:${minioConsolePort}`);
console.log("\n  Stop: docker compose --env-file .env -f docker/docker-compose.yml down");
