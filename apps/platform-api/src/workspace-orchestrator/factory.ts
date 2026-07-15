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
import {
  createDockerMinioIdentityAdmin,
  createMinioObjectStorageProvisioner
} from "./minio-object-storage";

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
  const mode = resolveWorkspaceAdapterMode(env);
  const encryptionKeyHex = opts.secretKeyHex ?? env.EVCP_WORKSPACE_SECRET_KEY;

  if (mode === "real" && !encryptionKeyHex) {
    throw new Error(
      "EVCP_WORKSPACE_SECRET_KEY is required when EVCP_WORKSPACE_REAL_ADAPTERS=1"
    );
  }
  if (mode === "real" && (!env.EVCP_LITELLM_BASE_URL || !env.EVCP_LITELLM_MASTER_KEY)) {
    throw new Error(
      "EVCP_LITELLM_BASE_URL and EVCP_LITELLM_MASTER_KEY are required when EVCP_WORKSPACE_REAL_ADAPTERS=1"
    );
  }
  if (mode === "real" && (!env.MINIO_ROOT_USER || !env.MINIO_ROOT_PASSWORD)) {
    throw new Error(
      "MINIO_ROOT_USER and MINIO_ROOT_PASSWORD are required when EVCP_WORKSPACE_REAL_ADAPTERS=1"
    );
  }
  const resolvedEncryptionKeyHex = encryptionKeyHex ?? DEV_SECRET_KEY;

  if (mode === "real") {
    const docker = createDockerSocketEngine();
    const runtimeOptions = resolveWorkspaceRuntimeOptions(env);
    const pgRunSql = createPgRunSql({
      host: env.EVCP_PG_ADMIN_HOST ?? env.EVCP_PG_HOST ?? "postgres",
      port: Number(env.EVCP_PG_PORT ?? 5432),
      user: env.POSTGRES_USER ?? "evcp",
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB ?? "evcp"
    });

    const objectStorage = createMinioObjectStorageProvisioner({
      endPoint: env.EVCP_S3_ADMIN_HOST ?? env.EVCP_S3_HOST ?? "minio",
      port: Number(env.EVCP_S3_PORT ?? 9000),
      useSSL: (env.EVCP_S3_SSL ?? "false") === "true",
      accessKey: env.MINIO_ROOT_USER as string,
      secretKey: env.MINIO_ROOT_PASSWORD as string,
      identityAdmin: createDockerMinioIdentityAdmin(docker, {
        containerName: env.EVCP_MINIO_CONTAINER_NAME ?? "evcp-minio",
        adminAccessKey: env.MINIO_ROOT_USER as string,
        adminSecretKey: env.MINIO_ROOT_PASSWORD as string
      })
    });

    console.warn(
      `[workspace] real-adapter mode: Docker=real, Postgres=real (${env.EVCP_PG_HOST ?? "postgres"}), ` +
        `MinIO=real (${env.EVCP_S3_HOST ?? "minio"}), LiteLLM=real.`
    );

    // Persist secrets encrypted-at-rest so per-project DATABASE_URL (etc.) survive restarts.
    const secretUser = encodeURIComponent(env.POSTGRES_USER ?? "evcp");
    const secretPass = encodeURIComponent(env.POSTGRES_PASSWORD ?? "");
    const secretHost = env.EVCP_PG_ADMIN_HOST ?? env.EVCP_PG_HOST ?? "postgres";
    const secretPort = Number(env.EVCP_PG_PORT ?? 5432);
    const secretDb = env.POSTGRES_DB ?? "evcp";
    const secrets = createProjectSecretStore({
      encryptionKeyHex: resolvedEncryptionKeyHex,
      persistence: createPgSecretPersistence(
        `postgresql://${secretUser}:${secretPass}@${secretHost}:${secretPort}/${secretDb}`
      )
    });
    void secrets.hydrate();

    return createWorkspaceOrchestrator({
      postgres: createPgClientPostgresProvisioner(pgRunSql),
      objectStorage,
      llmGateway: createLiteLlmGatewayAdmin({
        baseUrl: env.EVCP_LITELLM_BASE_URL as string,
        masterKey: env.EVCP_LITELLM_MASTER_KEY as string
      }),
      secrets,
      docker,
      ...runtimeOptions,
      onAudit: opts.onAudit
    });
  }

  return createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: resolvedEncryptionKeyHex }),
    docker: createMemoryDockerEngine(),
    onAudit: opts.onAudit
  });
}
