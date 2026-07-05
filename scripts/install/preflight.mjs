#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_ENV = [
  "EVCP_ORG_NAME",
  "EVCP_BASE_URL",
  "EVCP_HTTP_PORT",
  "EVCP_API_PORT",
  "EVCP_ADMIN_PORT",
  "EVCP_CREATOR_PORT",
  "EVCP_STORE_PORT",
  "DATABASE_URL",
  "EVCP_CORE_PERSISTENCE",
  "POSTGRES_PASSWORD",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "FIRST_ADMIN_EMAIL",
  "KEYCLOAK_ADMIN_PASSWORD",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
  "REDIS_URL",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_KEY",
  "BACKUP_BUCKET",
  "BACKUP_RETENTION_DAYS"
];

const SECRET_ENV = [
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "KEYCLOAK_ADMIN_PASSWORD",
  "MINIO_ROOT_PASSWORD",
  "STORAGE_SECRET_KEY",
  "AI_API_KEY"
];

const REQUIRED_SERVICES = [
  "postgres",
  "redis",
  "minio",
  "keycloak",
  "platform-api",
  "admin-web",
  "creator-web",
  "app-store-pwa",
  "caddy"
];

const REQUIRED_PORT_KEYS = ["EVCP_HTTP_PORT", "EVCP_API_PORT", "EVCP_ADMIN_PORT", "EVCP_CREATOR_PORT", "EVCP_STORE_PORT"];
const CORE_PERSISTENCE_MODES = ["legacy", "memory", "prisma"];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envPath: ".env",
    composePath: "docker/docker-compose.yml",
    live: false,
    allowExampleSecrets: false,
    json: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") options.envPath = argv[++index];
    else if (arg === "--compose") options.composePath = argv[++index];
    else if (arg === "--live") options.live = true;
    else if (arg === "--allow-example-secrets") options.allowExampleSecrets = true;
    else if (arg === "--text") options.json = false;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function loadEnvFile(envPath) {
  const resolved = resolve(envPath);
  if (!existsSync(resolved)) {
    throw new Error(`Environment file not found: ${envPath}`);
  }

  const env = {};
  for (const rawLine of readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
    env[key] = value;
  }
  return env;
}

export function parseComposeServices(composeText) {
  const services = new Set();
  const lines = composeText.split(/\r?\n/);
  let inServices = false;
  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line) && !/^services:\s*$/.test(line)) break;
    const match = line.match(/^  ([a-zA-Z0-9_-]+):\s*$/);
    if (inServices && match && !match[1].startsWith("x-")) services.add(match[1]);
  }
  return [...services];
}

export function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

export function redactEnv(env) {
  const redacted = {};
  for (const [key, value] of Object.entries(env)) {
    redacted[key] = SECRET_ENV.includes(key) ? maskSecret(value) : value;
  }
  return redacted;
}

function check(name, passed, observed, action = "-") {
  return { name, passed, observed, action };
}

function isExampleSecret(value) {
  return /example|change-before-use|changeme|change-me/i.test(value);
}

function hasStrongEnoughSecret(value) {
  return typeof value === "string" && value.length >= 24;
}

function runVersion(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return "";
  }
}

export function evaluateInstallContract({ env, composeText, envPath = ".env", composePath = "docker/docker-compose.yml", live = false, allowExampleSecrets = false }) {
  const checks = [];
  const composeServices = parseComposeServices(composeText);

  for (const key of REQUIRED_ENV) {
    checks.push(check(`env:${key}`, Boolean(env[key]), env[key] ? "present" : "missing", `Set ${key} in ${envPath}`));
  }
  checks.push(
    check(
      "env:EVCP_CORE_PERSISTENCE:mode",
      CORE_PERSISTENCE_MODES.includes(String(env.EVCP_CORE_PERSISTENCE ?? "").toLowerCase()),
      env.EVCP_CORE_PERSISTENCE ?? "missing",
      "Set EVCP_CORE_PERSISTENCE to legacy, memory or prisma"
    )
  );

  for (const key of SECRET_ENV) {
    const value = env[key] ?? "";
    const exampleAllowed = allowExampleSecrets && isExampleSecret(value);
    checks.push(
      check(
        `secret:${key}`,
        hasStrongEnoughSecret(value) && (exampleAllowed || !isExampleSecret(value)),
        value ? maskSecret(value) : "missing",
        exampleAllowed ? "Replace example secret before production use" : `Set a non-example secret for ${key}`
      )
    );
  }

  const ports = REQUIRED_PORT_KEYS.map((key) => Number(env[key]));
  for (const key of REQUIRED_PORT_KEYS) {
    const value = Number(env[key]);
    checks.push(check(`port:${key}`, Number.isInteger(value) && value > 0 && value < 65536, env[key] ?? "missing", `Set ${key} to a valid TCP port`));
  }
  checks.push(check("ports:unique", new Set(ports).size === ports.length, ports.join(", "), "Use unique host ports for platform surfaces"));

  for (const service of REQUIRED_SERVICES) {
    checks.push(check(`compose:${service}`, composeServices.includes(service), composeServices.includes(service) ? "declared" : "missing", `Add ${service} to ${composePath}`));
  }

  checks.push(check("compose:env-file", composeText.includes("../.env"), composeText.includes("../.env") ? "declared" : "missing", "Compose services must load ../.env"));
  checks.push(check("compose:no-hardcoded-postgres-password", !/POSTGRES_PASSWORD:\s*evcp\b/.test(composeText), "checked", "Do not hardcode default database password"));
  checks.push(check("compose:caddy-route", composeText.includes("caddy") && existsSync("docker/Caddyfile"), "checked", "Add Caddy reverse proxy config"));

  if (live) {
    const nodeVersion = runVersion("node", ["--version"]);
    const pnpmVersion = runVersion("pnpm", ["--version"]);
    const dockerVersion = runVersion("docker", ["--version"]);
    const composeVersion = runVersion("docker", ["compose", "version"]);
    checks.push(check("tool:node", Boolean(nodeVersion), nodeVersion || "missing", "Install Node.js"));
    checks.push(check("tool:pnpm", Boolean(pnpmVersion), pnpmVersion || "missing", "Install pnpm"));
    checks.push(check("tool:docker", Boolean(dockerVersion), dockerVersion || "missing", "Install Docker"));
    checks.push(check("tool:docker-compose", Boolean(composeVersion), composeVersion || "missing", "Install Docker Compose v2"));
  }

  const passed = checks.every((item) => item.passed);
  return {
    passed,
    mode: live ? "live" : "contract",
    envFile: basename(envPath),
    composeFile: composePath,
    serviceCount: composeServices.length,
    composeServices,
    redactedEnv: redactEnv(env),
    checks
  };
}

export function printTextReport(report) {
  const lines = [`EVCP install preflight: ${report.passed ? "PASS" : "FAIL"}`, `mode: ${report.mode}`, `env: ${report.envFile}`, `compose: ${report.composeFile}`];
  for (const item of report.checks) {
    lines.push(`${item.passed ? "PASS" : "FAIL"} ${item.name} - ${item.observed}`);
  }
  return lines.join("\n");
}

function printHelp() {
  return `Usage: node scripts/install/preflight.mjs [--env .env] [--compose docker/docker-compose.yml] [--live] [--allow-example-secrets] [--text]\n\nDefault mode validates the install contract without requiring Docker to be running.\nUse --live to additionally check local tool availability.`;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(printHelp());
    return;
  }
  const env = loadEnvFile(options.envPath);
  const composePath = resolve(options.composePath);
  if (!existsSync(composePath)) throw new Error(`Compose file not found: ${options.composePath}`);
  const report = evaluateInstallContract({
    env,
    composeText: readFileSync(composePath, "utf8"),
    envPath: options.envPath,
    composePath: options.composePath,
    live: options.live,
    allowExampleSecrets: options.allowExampleSecrets
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : printTextReport(report));
  process.exitCode = report.passed ? 0 : 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
