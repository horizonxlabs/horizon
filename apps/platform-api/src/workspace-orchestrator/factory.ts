import { createWorkspaceOrchestrator, type WorkspaceOrchestrator } from "./orchestrator";
import { createPgClientPostgresProvisioner } from "./postgres-provisioner";
import { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } from "./resource-ports";
import { createProjectSecretStore } from "./secret-store";
import { createMemoryDockerEngine } from "./docker-engine";
import type { WorkspaceAuthContext } from "./routes";

const DEV_SECRET_KEY = "0".repeat(64);

export function createDefaultWorkspaceOrchestrator(opts: {
  secretKeyHex?: string;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
} = {}): WorkspaceOrchestrator {
  const encryptionKeyHex = opts.secretKeyHex ?? process.env.EVCP_WORKSPACE_SECRET_KEY ?? DEV_SECRET_KEY;
  return createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex }),
    docker: createMemoryDockerEngine(),
    onAudit: opts.onAudit
  });
}

export function toWorkspaceAuthContext(user: {
  id: string;
  roles?: string[];
  projectIds?: string[];
}): WorkspaceAuthContext {
  return {
    userId: user.id,
    roles: user.roles ?? [],
    projectIds: user.projectIds ?? []
  };
}
