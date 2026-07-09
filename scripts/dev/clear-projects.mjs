#!/usr/bin/env node
// Dev-only: wipe ALL projects and their physical resources for a clean slate.
//   node scripts/dev/clear-projects.mjs --yes
//
// Removes: every project row + all project-scoped data (TRUNCATE ... CASCADE keeps platform
// users/roles/providers), the per-project Postgres schemas (app_*) + login roles (app_*_role),
// the encrypted project_secrets, and the evcp-ws-* workspace containers + their data volumes.
// Idempotent. DESTRUCTIVE and irreversible — requires --yes.

import { execSync } from "node:child_process";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to wipe without --yes. Usage: node scripts/dev/clear-projects.mjs --yes");
  process.exit(1);
}

const PG = "evcp-postgres";
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", ...opts }).trim();
const psql = (sql, { stop = true } = {}) =>
  sh(`docker exec -i ${PG} psql -U evcp -d evcp ${stop ? "-v ON_ERROR_STOP=1 " : ""}-tA`, {
    input: sql
  });
const lines = (out) =>
  out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

console.log("1) Truncating projects (+ cascade) and project_secrets…");
psql("TRUNCATE TABLE projects CASCADE;");
psql("TRUNCATE TABLE project_secrets;", { stop: false });

console.log("2) Dropping per-project schemas (app_*) and roles (app_*_role)…");
const schemas = lines(
  psql("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'app\\_%';")
);
for (const schema of schemas) {
  // best-effort: schema drop must precede role drop (role owns the schema objects)
  psql(`DROP SCHEMA IF EXISTS "${schema}" CASCADE;`, { stop: false });
  psql(`DROP ROLE IF EXISTS "${schema}_role";`, { stop: false });
  console.log(`   dropped ${schema}`);
}

console.log("3) Removing evcp-ws-* containers and volumes…");
const containers = lines(sh('docker ps -aq --filter "name=evcp-ws-" || true'));
if (containers.length) sh(`docker rm -f ${containers.join(" ")}`);
const volumes = lines(sh('docker volume ls -q --filter "name=evcp-ws-" || true'));
if (volumes.length) sh(`docker volume rm ${volumes.join(" ")}`);
console.log(`   removed ${containers.length} container(s), ${volumes.length} volume(s)`);

const remaining = psql("SELECT count(*) FROM projects;", { stop: false });
console.log(`\nDone. projects rows remaining: ${remaining}`);
