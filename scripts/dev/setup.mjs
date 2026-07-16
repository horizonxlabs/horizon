#!/usr/bin/env node
// Idempotent dev bootstrap: start all services, migrate DB, seed, wait for Keycloak.
// Run once after clone, safe to re-run.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}

function dockerInspect(name, format) {
  const r = spawnSync("docker", ["inspect", `--format=${format}`, name]);
  return r.status === 0 ? r.stdout.toString().trim() : null;
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

const env = { ...process.env, ...loadEnvFile(resolve(root, ".env.dev")) };

// ── 1. Start all dev services ────────────────────────────────────────────────
console.log("Starting dev services...");
execSync("docker compose -f docker/docker-compose.dev.yml up -d", { cwd: root, stdio: "inherit" });

// ── 2. Wait for postgres ─────────────────────────────────────────────────────
await waitFor("postgres", () => {
  const r = spawnSync("docker", ["exec", "evcp-dev-postgres", "pg_isready", "-U", "evcp", "-d", "evcp"]);
  return r.status === 0;
}, 60_000);

// ── 3. Create litellm database (idempotent) ──────────────────────────────────
spawnSync("docker", ["exec", "evcp-dev-postgres", "psql", "-U", "evcp", "-c", "CREATE DATABASE litellm;"], { cwd: root });

// ── 4. Migrate and seed ──────────────────────────────────────────────────────
console.log("Running migrations...");
execSync(
  "pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma",
  { cwd: root, stdio: "inherit", env }
);
console.log("Seeding database...");
execSync("pnpm --filter @evcp/platform-api seed", { cwd: root, stdio: "inherit", env });

// ── 5. Wait for Keycloak (~60-90 s on first run) ─────────────────────────────
await waitFor("Keycloak (may take ~90 s on first run)", () => {
  const status = dockerInspect("evcp-dev-keycloak", "{{.State.Health.Status}}");
  return status === "healthy";
}, 180_000);

// ── 6. Wait for keycloak-bootstrap to complete ────────────────────────────────
await waitFor("Keycloak client bootstrap", () => {
  const status = dockerInspect("evcp-dev-keycloak-bootstrap", "{{.State.Status}}");
  return status === "exited";
}, 60_000);

const bsExit = dockerInspect("evcp-dev-keycloak-bootstrap", "{{.State.ExitCode}}");
if (bsExit !== "0") {
  throw new Error(
    `keycloak-bootstrap exited with code ${bsExit}. Check logs: docker logs evcp-dev-keycloak-bootstrap`
  );
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n✓ Dev setup complete — run `pnpm dev` to start everything with hot reload.");
console.log("  Admin:    http://localhost:4100");
console.log("  Creator:  http://localhost:4101");
console.log("  Store:    http://localhost:4102");
console.log("  API:      http://localhost:3100");
console.log("  Keycloak: http://localhost:8081/auth  (admin / devkeycloakpassword)");
console.log("  MinIO:    http://localhost:9001        (evcpminio / devminiopassword)");
console.log("  LiteLLM:  http://localhost:4000");
