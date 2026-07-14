import type { WorkspaceContainerRecord } from "@evcp/types";
import type { DockerEngine } from "./docker-engine";
import type { PostgresProvisioner } from "./postgres-provisioner";
import type { LlmGatewayAdmin, ObjectStorageProvisioner } from "./resource-ports";
import type { ProjectSecretStore } from "./secret-store";
import type { WorkspaceRuntimeRecordStore } from "../persistence/workspace-runtime-repository";

export interface WorkspaceAuditEvent {
  action: string;
  projectId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceOrchestratorDeps {
  postgres: PostgresProvisioner;
  objectStorage: ObjectStorageProvisioner;
  llmGateway: LlmGatewayAdmin;
  secrets: ProjectSecretStore;
  docker: DockerEngine;
  image?: string;
  network?: string;
  cpuCores?: number;
  memoryMb?: number;
  databaseName?: string;
  postgresHost?: string;
  s3Endpoint?: string;
  onAudit?: (event: WorkspaceAuditEvent) => void;
  runtimeRecords?: WorkspaceRuntimeRecordStore;
}

export type { WorkspaceContainerRecord };
