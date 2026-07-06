import { createWorkspaceOrchestrator, type WorkspaceOrchestrator } from "./orchestrator";
import { createPgClientPostgresProvisioner } from "./postgres-provisioner";
import {
  createMemoryObjectStorageProvisioner,
  createMemoryLlmGatewayAdmin,
  createLiteLlmGatewayAdmin
} from "./resource-ports";
import { createProjectSecretStore } from "./secret-store";
import { createMemoryDockerEngine } from "./docker-engine";
import { createDockerSocketEngine } from "./docker-socket-engine";

const DEV_SECRET_KEY = "0".repeat(64);

export function resolveWorkspaceAdapterMode(
  env: Record<string, string | undefined> = process.env
): "memory" | "real" {
  return env.EVCP_WORKSPACE_REAL_ADAPTERS === "1" ? "real" : "memory";
}

export function createDefaultWorkspaceOrchestrator(opts: {
  secretKeyHex?: string;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
  env?: Record<string, string | undefined>;
} = {}): WorkspaceOrchestrator {
  const env = opts.env ?? process.env;
  const encryptionKeyHex = opts.secretKeyHex ?? env.EVCP_WORKSPACE_SECRET_KEY ?? DEV_SECRET_KEY;
  const mode = resolveWorkspaceAdapterMode(env);

  if (mode === "real") {
    const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL && env.EVCP_LITELLM_MASTER_KEY);
    console.warn(
      `[workspace] real-adapter mode active: Docker=real, LiteLLM=${hasLiteLlmConfig ? "real" : "memory-stub"}, ` +
        `Postgres/MinIO=in-memory placeholders. Containers boot for real but their DATABASE_URL/S3_* point at ` +
        `unprovisioned infrastructure and will NOT connect — do not treat a booted container as a working workspace ` +
        `until real Postgres/MinIO adapters land.`
    );
    return createWorkspaceOrchestrator({
      postgres: createPgClientPostgresProvisioner(async () => {}),
      objectStorage: createMemoryObjectStorageProvisioner(),
      llmGateway: hasLiteLlmConfig
        ? createLiteLlmGatewayAdmin({
            baseUrl: env.EVCP_LITELLM_BASE_URL as string,
            masterKey: env.EVCP_LITELLM_MASTER_KEY as string
          })
        : createMemoryLlmGatewayAdmin(),
      secrets: createProjectSecretStore({ encryptionKeyHex }),
      docker: createDockerSocketEngine(),
      onAudit: opts.onAudit
    });
  }

  return createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex }),
    docker: createMemoryDockerEngine(),
    onAudit: opts.onAudit
  });
}
