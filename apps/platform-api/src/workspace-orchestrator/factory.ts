import { createWorkspaceOrchestrator, type WorkspaceOrchestrator } from "./orchestrator";
import { createPgClientPostgresProvisioner } from "./postgres-provisioner";
import {
  createMemoryObjectStorageProvisioner,
  createMemoryLlmGatewayAdmin,
  createLiteLlmGatewayAdmin
} from "./resource-ports";
import { createProjectSecretStore } from "./secret-store";
import { createPgSecretPersistence } from "./secret-persistence";
import { createMemoryDockerEngine } from "./docker-engine";
import { createDockerSocketEngine } from "./docker-socket-engine";
import { createPgRunSql } from "./pg-runner";
import { createMinioObjectStorageProvisioner } from "./minio-object-storage";

const DEV_SECRET_KEY = "0".repeat(64);

export function resolveWorkspaceAdapterMode(
  env: Record<string, string | undefined> = process.env
): "memory" | "real" {
  return env.EVCP_WORKSPACE_REAL_ADAPTERS === "1" ? "real" : "memory";
}

export function resolveWorkspaceRuntimeOptions(
  env: Record<string, string | undefined> = process.env
) {
  const s3Ssl = (env.EVCP_S3_SSL ?? "false") === "true";
  return {
    image: env.EVCP_WORKSPACE_IMAGE,
    network: env.EVCP_WORKSPACE_NETWORK,
    databaseName: env.POSTGRES_DB ?? "evcp",
    postgresHost: `${env.EVCP_PG_HOST ?? "postgres"}:${env.EVCP_PG_PORT ?? "5432"}`,
    s3Endpoint: `${s3Ssl ? "https" : "http"}://${env.EVCP_S3_HOST ?? "minio"}:${env.EVCP_S3_PORT ?? "9000"}`
  };
}

export function createDefaultWorkspaceOrchestrator(
  opts: {
    secretKeyHex?: string;
    onAudit?: (event: {
      action: string;
      projectId: string;
      metadata?: Record<string, unknown>;
    }) => void;
    env?: Record<string, string | undefined>;
  } = {}
): WorkspaceOrchestrator {
  const env = opts.env ?? process.env;
  const encryptionKeyHex = opts.secretKeyHex ?? env.EVCP_WORKSPACE_SECRET_KEY ?? DEV_SECRET_KEY;
  const mode = resolveWorkspaceAdapterMode(env);

  if (mode === "real") {
    const runtimeOptions = resolveWorkspaceRuntimeOptions(env);
    const pgRunSql = createPgRunSql({
      host: env.EVCP_PG_HOST ?? "postgres",
      port: Number(env.EVCP_PG_PORT ?? 5432),
      user: env.POSTGRES_USER ?? "evcp",
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB ?? "evcp"
    });

    const objectStorage = createMinioObjectStorageProvisioner({
      endPoint: env.EVCP_S3_HOST ?? "minio",
      port: Number(env.EVCP_S3_PORT ?? 9000),
      useSSL: (env.EVCP_S3_SSL ?? "false") === "true",
      accessKey: env.MINIO_ROOT_USER as string,
      secretKey: env.MINIO_ROOT_PASSWORD as string
    });

    const hasLiteLlmConfig = Boolean(env.EVCP_LITELLM_BASE_URL && env.EVCP_LITELLM_MASTER_KEY);
    console.warn(
      `[workspace] real-adapter mode: Docker=real, Postgres=real (${env.EVCP_PG_HOST ?? "postgres"}), ` +
        `MinIO=real (${env.EVCP_S3_HOST ?? "minio"}), LiteLLM=${hasLiteLlmConfig ? "real" : "memory-stub (litellm not configured)"}.`
    );

    // Persist secrets encrypted-at-rest so per-project DATABASE_URL (etc.) survive restarts.
    const secretUser = encodeURIComponent(env.POSTGRES_USER ?? "evcp");
    const secretPass = encodeURIComponent(env.POSTGRES_PASSWORD ?? "");
    const secretHost = env.EVCP_PG_HOST ?? "postgres";
    const secretPort = Number(env.EVCP_PG_PORT ?? 5432);
    const secretDb = env.POSTGRES_DB ?? "evcp";
    const secrets = createProjectSecretStore({
      encryptionKeyHex,
      persistence: createPgSecretPersistence(
        `postgresql://${secretUser}:${secretPass}@${secretHost}:${secretPort}/${secretDb}`
      )
    });
    void secrets.hydrate();

    return createWorkspaceOrchestrator({
      postgres: createPgClientPostgresProvisioner(pgRunSql),
      objectStorage,
      llmGateway: hasLiteLlmConfig
        ? createLiteLlmGatewayAdmin({
            baseUrl: env.EVCP_LITELLM_BASE_URL as string,
            masterKey: env.EVCP_LITELLM_MASTER_KEY as string
          })
        : createMemoryLlmGatewayAdmin(),
      secrets,
      docker: createDockerSocketEngine(),
      ...runtimeOptions,
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
