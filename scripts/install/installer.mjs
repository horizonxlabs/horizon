#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateInstallContract, loadEnvFile } from "./preflight.mjs";

const CORE_SERVICES = [
  "platform-api",
  "admin-web",
  "creator-web",
  "app-store-pwa",
  "postgres",
  "redis",
  "minio",
  "keycloak",
  "caddy"
];
const SECRET_KEYS = [
  "password",
  "secret",
  "api_key",
  "apikey",
  "token",
  "client_secret",
  "access_key"
];

export function parseInstallerArgs(argv = process.argv.slice(2)) {
  const options = {
    envPath: ".env",
    composePath: "docker/docker-compose.yml",
    reportDir: ".evcp/install-reports",
    dryRun: true,
    allowExampleSecrets: false,
    json: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") options.envPath = argv[++index];
    else if (arg === "--compose") options.composePath = argv[++index];
    else if (arg === "--report-dir") options.reportDir = argv[++index];
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--execute") options.dryRun = false;
    else if (arg === "--allow-example-secrets") options.allowExampleSecrets = true;
    else if (arg === "--text") options.json = false;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function fingerprint(value) {
  return `sha256:${createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex")}`;
}

export function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      const lowerKey = key.toLowerCase();
      if (SECRET_KEYS.some((secretKey) => lowerKey.includes(secretKey))) {
        return [`${key}Fingerprint`, fingerprint(entry)];
      }
      return [key, redactDeep(entry)];
    })
  );
}

export function buildSetupEvidence(env) {
  return {
    organization: {
      name: env.EVCP_ORG_NAME,
      baseUrl: env.EVCP_BASE_URL
    },
    network: {
      domain: env.EVCP_PUBLIC_DOMAIN,
      httpPort: Number(env.EVCP_HTTP_PORT),
      httpsPort: Number(env.EVCP_HTTPS_PORT || 443),
      apiPort: Number(env.EVCP_API_PORT),
      adminPort: Number(env.EVCP_ADMIN_PORT),
      creatorPort: Number(env.EVCP_CREATOR_PORT),
      storePort: Number(env.EVCP_STORE_PORT),
      tlsMode: env.EVCP_PUBLIC_DOMAIN === "localhost" ? "local_http" : "caddy_tls"
    },
    database: {
      urlMasked: maskDatabaseUrl(env.DATABASE_URL ?? ""),
      passwordFingerprint: fingerprint(env.POSTGRES_PASSWORD)
    },
    storage: redactDeep({
      provider: "minio",
      endpoint: env.STORAGE_ENDPOINT,
      bucket: env.MINIO_BUCKET,
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY
    }),
    auth: redactDeep({
      mode: "keycloak",
      realm: env.KEYCLOAK_REALM,
      admin: env.KEYCLOAK_ADMIN,
      adminPassword: env.KEYCLOAK_ADMIN_PASSWORD
    }),
    ai: redactDeep({
      provider: env.AI_PROVIDER,
      model: env.AI_MODEL,
      apiKey: env.AI_API_KEY
    }),
    guardrail: {
      defaultPolicy: "enterprise-default",
      blockHighRisk: true
    },
    backup: {
      bucket: env.BACKUP_BUCKET,
      retentionDays: Number(env.BACKUP_RETENTION_DAYS),
      encryptionKeyRef: env.BACKUP_ENCRYPTION_KEY_REF
    },
    firstAdmin: {
      email: env.FIRST_ADMIN_EMAIL,
      name: env.FIRST_ADMIN_NAME
    }
  };
}

export function evaluateComposeReadiness(preflightReport) {
  return CORE_SERVICES.map((service) => ({
    name: service,
    status: preflightReport.composeServices.includes(service) ? "ready" : "missing",
    action: preflightReport.composeServices.includes(service)
      ? "-"
      : `Declare ${service} in ${preflightReport.composeFile}`
  }));
}

export function createStage(name, status, detail, actions = []) {
  return {
    name,
    status,
    detail,
    retryable: status !== "passed",
    actions
  };
}

export function buildInstallReport({
  env,
  composeText,
  options,
  startedAt = new Date().toISOString()
}) {
  const preflight = evaluateInstallContract({
    env,
    composeText,
    envPath: options.envPath,
    composePath: options.composePath,
    live: !options.dryRun,
    allowExampleSecrets: options.allowExampleSecrets
  });
  const setupEvidence = buildSetupEvidence(env);
  const composeReadiness = evaluateComposeReadiness(preflight);
  const actionableFailures = preflight.checks
    .filter((check) => !check.passed)
    .map((check) => `${check.name}: ${check.action}`);
  const stages = [
    createStage(
      "preflight",
      preflight.passed ? "passed" : "failed",
      preflight.passed ? "All prerequisite checks passed" : "Preflight blocked install",
      actionableFailures
    ),
    createStage(
      "configure",
      preflight.passed ? "passed" : "blocked",
      "Captured setup wizard configuration evidence",
      preflight.passed ? [] : ["Fix preflight failures before writing setup evidence"]
    ),
    createStage(
      "write_config_evidence",
      preflight.passed ? "passed" : "blocked",
      "Wrote redacted install report and setup evidence",
      preflight.passed ? [] : ["No config evidence written for failed preflight"]
    ),
    createStage(
      "deploy_compose",
      preflight.passed ? "passed" : "blocked",
      options.dryRun
        ? "Dry-run planned docker compose deployment"
        : "Docker Compose deployment executed",
      ["docker compose --env-file <env> -f <compose> up -d"]
    ),
    createStage(
      "migrate_seed",
      preflight.passed ? "passed" : "blocked",
      options.dryRun
        ? "Dry-run planned Prisma migrate deploy and seed"
        : "Database migration and seed executed",
      [
        "pnpm --filter @evcp/platform-api exec prisma migrate deploy",
        "pnpm --filter @evcp/platform-api seed"
      ]
    ),
    createStage(
      "verify_health",
      preflight.passed ? "passed" : "blocked",
      "Verified required service readiness contract",
      composeReadiness
        .filter((service) => service.status !== "ready")
        .map((service) => service.action)
    )
  ];
  const passed =
    stages.every((stage) => stage.status === "passed") &&
    composeReadiness.every((service) => service.status === "ready");

  return {
    id: `install_${createHash("sha256").update(`${startedAt}:${options.envPath}:${options.composePath}`).digest("hex").slice(0, 12)}`,
    status: passed ? "passed" : "failed",
    mode: options.dryRun ? "dry-run" : "execute",
    envFile: basename(options.envPath),
    composeFile: options.composePath,
    reportPath: "",
    startedAt,
    finishedAt: new Date().toISOString(),
    stages,
    setupEvidence,
    preflight,
    composeReadiness,
    actionableFailures
  };
}

export function runInstaller(options) {
  const env = loadEnvFile(options.envPath);
  const composePath = resolve(options.composePath);
  if (!existsSync(composePath)) throw new Error(`Compose file not found: ${options.composePath}`);

  const report = buildInstallReport({
    env,
    composeText: readFileSync(composePath, "utf8"),
    options
  });

  if (!options.dryRun && report.status === "passed") {
    execFileSync(
      "docker",
      ["compose", "--env-file", options.envPath, "-f", options.composePath, "up", "-d"],
      { stdio: "inherit" }
    );
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@evcp/platform-api",
        "exec",
        "prisma",
        "migrate",
        "deploy",
        "--schema",
        "prisma/schema.prisma"
      ],
      { stdio: "inherit" }
    );
    execFileSync("pnpm", ["--filter", "@evcp/platform-api", "seed"], { stdio: "inherit" });
  }

  mkdirSync(options.reportDir, { recursive: true });
  const reportPath = resolve(options.reportDir, `${report.id}.json`);
  const withPath = { ...report, reportPath };
  writeFileSync(reportPath, `${JSON.stringify(withPath, null, 2)}\n`);
  return withPath;
}

export function printInstallerTextReport(report) {
  const lines = [
    `EVCP installer: ${report.status.toUpperCase()}`,
    `mode: ${report.mode}`,
    `report: ${report.reportPath}`,
    `env: ${report.envFile}`,
    `compose: ${report.composeFile}`
  ];
  for (const stage of report.stages) {
    lines.push(`${stage.status.toUpperCase()} ${stage.name} - ${stage.detail}`);
    for (const action of stage.actions) lines.push(`  action: ${action}`);
  }
  return lines.join("\n");
}

function maskDatabaseUrl(databaseUrl) {
  return databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

function printHelp() {
  return `Usage: node scripts/install/installer.mjs [--env .env] [--compose docker/docker-compose.yml] [--report-dir .evcp/install-reports] [--dry-run|--execute] [--allow-example-secrets] [--text]\n\nDefault mode is dry-run so CI can verify the install flow without starting services.\nUse --execute only on a prepared private server.`;
}

async function main() {
  const options = parseInstallerArgs();
  if (options.help) {
    console.log(printHelp());
    return;
  }
  const report = runInstaller(options);
  console.log(options.json ? JSON.stringify(report, null, 2) : printInstallerTextReport(report));
  process.exitCode = report.status === "passed" ? 0 : 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
