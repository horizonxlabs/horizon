#!/usr/bin/env node
// Idempotent dev bootstrap: bring up the full containerized stack from
// docker/docker-compose.yml with one command. Prisma migrate/generate/seed run inside
// the platform-api container on start, so this script only starts the stack and waits
// for the slow services (Keycloak, platform-api) to become reachable.
// Run once after clone, safe to re-run.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function dockerInspect(name, format) {
  const r = spawnSync("docker", ["inspect", `--format=${format}`, name]);
  return r.status === 0 ? r.stdout.toString().trim() : null;
}

function httpOk(url) {
  const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url]);
  return r.status === 0 && /^[23]\d\d$/.test(r.stdout.toString().trim());
}

async function waitFor(label, checkFn, timeoutMs = 60_000) {
  process.stdout.write(`Waiting for ${label}`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkFn()) { console.log(" ✓"); return; }
    process.stdout.write(".");
    await new Promise((res) => setTimeout(res, 2000));
  }
  console.log(" ✗");
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000}s`);
}

// ── 1. Start the whole stack ─────────────────────────────────────────────────
console.log("Starting full dev stack (docker/docker-compose.yml)...");
execSync("docker compose --env-file .env -f docker/docker-compose.yml up -d", {
  cwd: root,
  stdio: "inherit"
});

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
  () => httpOk("http://localhost:3100/health") || httpOk("http://localhost:3100"),
  300_000
);

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n✓ Dev stack up — everything runs in containers with hot reload.");
console.log("  App (via Caddy): http://localhost:8080  (/admin · /creator · /store · /api)");
console.log("  API:             http://localhost:3100");
console.log("  Keycloak:        http://localhost:8081/auth  (admin / see KEYCLOAK_ADMIN_PASSWORD)");
console.log("  MinIO console:   http://localhost:9001");
console.log("\n  Stop: docker compose -f docker/docker-compose.yml down");
