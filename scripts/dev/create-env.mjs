import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvTemplate(template) {
  const values = {};
  for (const rawLine of template.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function replaceEnvValues(template, replacements) {
  const replacedKeys = new Set();
  const rendered = template
    .split(/\r?\n/)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator === -1 || line.trimStart().startsWith("#")) return line;
      const key = line.slice(0, separator).trim();
      if (!Object.hasOwn(replacements, key)) return line;
      replacedKeys.add(key);
      return `${key}=${replacements[key]}`;
    })
    .join("\n");

  const missing = Object.entries(replacements)
    .filter(([key]) => !replacedKeys.has(key))
    .map(([key, value]) => `${key}=${value}`);
  return missing.length > 0 ? `${rendered}\n${missing.join("\n")}` : rendered;
}

function isPlaceholderSecret(value) {
  return (
    !value ||
    value.length < 24 ||
    /example|change-before-use|changeme|change-me/i.test(value) ||
    /^0+$/.test(value)
  );
}

function localEnvReplacements(source, randomHex, preserveRealSecrets) {
  const keepOrGenerate = (key, bytes, prefix = "") => {
    const value = source[key] ?? "";
    return preserveRealSecrets && !isPlaceholderSecret(value)
      ? value
      : `${prefix}${randomHex(bytes)}`;
  };
  const postgresUser = source.POSTGRES_USER || "evcp";
  const postgresDb = source.POSTGRES_DB || "evcp";
  const minioUser = source.MINIO_ROOT_USER || "evcpminio";
  const postgresPassword = keepOrGenerate("POSTGRES_PASSWORD", 24);
  const minioPassword = keepOrGenerate("MINIO_ROOT_PASSWORD", 24);
  const encodedPostgresUser = encodeURIComponent(postgresUser);
  const encodedPostgresPassword = encodeURIComponent(postgresPassword);

  return {
    COMPOSE_PROJECT_NAME: source.COMPOSE_PROJECT_NAME || `evcp-local-${randomHex(4)}`,
    POSTGRES_PASSWORD: postgresPassword,
    DATABASE_URL: `postgresql://${encodedPostgresUser}:${encodedPostgresPassword}@postgres:5432/${postgresDb}?schema=public`,
    SESSION_SECRET: keepOrGenerate("SESSION_SECRET", 32),
    ENCRYPTION_KEY: keepOrGenerate("ENCRYPTION_KEY", 32),
    KEYCLOAK_ADMIN_PASSWORD: keepOrGenerate("KEYCLOAK_ADMIN_PASSWORD", 24),
    KEYCLOAK_PLATFORM_CLIENT_SECRET: keepOrGenerate("KEYCLOAK_PLATFORM_CLIENT_SECRET", 32),
    KEYCLOAK_ADMIN_CLIENT_SECRET: keepOrGenerate("KEYCLOAK_ADMIN_CLIENT_SECRET", 32),
    MINIO_ROOT_PASSWORD: minioPassword,
    STORAGE_ACCESS_KEY: minioUser,
    STORAGE_SECRET_KEY: minioPassword,
    LITELLM_MASTER_KEY: keepOrGenerate("LITELLM_MASTER_KEY", 24, "sk-"),
    LITELLM_DATABASE_URL: `postgresql://${encodedPostgresUser}:${encodedPostgresPassword}@postgres:5432/litellm`,
    EVCP_WORKSPACE_SECRET_KEY: keepOrGenerate("EVCP_WORKSPACE_SECRET_KEY", 32),
    EVCP_AI_JOB_ENCRYPTION_KEY: keepOrGenerate("EVCP_AI_JOB_ENCRYPTION_KEY", 32)
  };
}

export function renderLocalEnv(
  template,
  randomHex = (bytes) => randomBytes(bytes).toString("hex")
) {
  const source = parseEnvTemplate(template);
  return replaceEnvValues(template, localEnvReplacements(source, randomHex, false));
}

export function ensureLocalEnv(
  root,
  { randomHex = (bytes) => randomBytes(bytes).toString("hex") } = {}
) {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) {
    const templatePath = resolve(root, ".env.example");
    const rendered = renderLocalEnv(readFileSync(templatePath, "utf8"), randomHex);
    writeFileSync(envPath, rendered.endsWith("\n") ? rendered : `${rendered}\n`, { mode: 0o600 });
    return { created: true, repaired: false, envPath };
  }

  const existing = readFileSync(envPath, "utf8");
  const source = parseEnvTemplate(existing);
  const repaired = replaceEnvValues(existing, localEnvReplacements(source, randomHex, true));
  const normalized = repaired.endsWith("\n") ? repaired : `${repaired}\n`;
  if (normalized === existing) return { created: false, repaired: false, envPath };

  writeFileSync(envPath, normalized, { mode: 0o600 });
  return { created: false, repaired: true, envPath };
}
