import { readFileSync } from "node:fs";

// Vars that may be delivered as a Docker secret file (`<NAME>_FILE`) instead of a plaintext
// env var. Kept as an explicit allowlist so an attacker-controlled `*_FILE` cannot inject
// arbitrary env. VAULT_TOKEN_FILE is intentionally absent — app-factory already reads it directly.
const FILE_BACKED = [
  "POSTGRES_PASSWORD",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "EVCP_LITELLM_MASTER_KEY",
  "EVCP_WORKSPACE_SECRET_KEY",
  "EVCP_AI_JOB_ENCRYPTION_KEY",
  "KEYCLOAK_PLATFORM_CLIENT_SECRET",
  "KEYCLOAK_ADMIN_CLIENT_SECRET",
  "SESSION_SECRET"
] as const;

export function hydrateFileBackedSecrets(env: NodeJS.ProcessEnv = process.env): void {
  for (const name of FILE_BACKED) {
    const file = env[`${name}_FILE`];
    if (!file || env[name]) continue;
    try {
      env[name] = readFileSync(file, "utf8").trim();
    } catch {
      // Missing/unreadable secret file: leave the var unset so downstream config validation
      // reports the real "missing X" error rather than a file path.
    }
  }
}
