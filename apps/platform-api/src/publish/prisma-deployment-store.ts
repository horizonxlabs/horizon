import { randomUUID } from "node:crypto";
import type { DeploymentHealthStatus, EnvironmentName, WorkspaceDeployment } from "@evcp/types";
import type { DeploymentStore } from "./deployment-store";

type RevisionRecord = Omit<WorkspaceDeployment, "environment" | "healthStatus" | "createdAt"> & {
  environment: string;
  healthStatus: string;
  createdAt: Date | string;
};

export interface DeploymentRevisionClient {
  workspaceDeploymentRevision: {
    findMany(args: { orderBy: { createdAt: "asc" } }): Promise<RevisionRecord[]>;
    create(args: { data: RevisionRecord }): Promise<RevisionRecord>;
    update(args: {
      where: { id: string };
      data: Partial<Pick<RevisionRecord, "healthStatus" | "imageDigest" | "containerId" | "containerName">>;
    }): Promise<RevisionRecord>;
    deleteMany(args: { where: { projectId?: string; id?: string } }): Promise<{ count: number }>;
  };
  $transaction<T>(
    operation: (
      transaction: Pick<DeploymentRevisionClient, "workspaceDeploymentRevision">
    ) => Promise<T>
  ): Promise<T>;
}

export async function createPrismaDeploymentStore(
  databaseUrl = process.env.DATABASE_URL,
  injectedClient?: DeploymentRevisionClient
): Promise<DeploymentStore> {
  const client = injectedClient ?? (await loadClient(databaseUrl));
  const rows = await client.workspaceDeploymentRevision.findMany({ orderBy: { createdAt: "asc" } });
  const byId = new Map(rows.map((row) => [row.id, mapRecord(row)]));
  const order = rows.map((row) => row.id);
  type TransactionClient = Pick<DeploymentRevisionClient, "workspaceDeploymentRevision">;
  type PendingOperation = {
    deploymentId: string;
    write: (transaction: TransactionClient) => Promise<unknown>;
    rollback: () => void;
  };
  let operations: PendingOperation[] = [];
  let flushQueue: Promise<void> = Promise.resolve();
  const enqueue = (
    deploymentId: string,
    write: (transaction: TransactionClient) => Promise<unknown>,
    rollback: () => void
  ) => {
    operations.push({ deploymentId, write, rollback });
  };
  const flush = async () => {
    const batchOperations = operations;
    operations = [];
    if (batchOperations.length === 0) return flushQueue;

    const batch = flushQueue.then(async () => {
      try {
        await client.$transaction(async (transaction) => {
          for (const operation of batchOperations) await operation.write(transaction);
        });
      } catch (error) {
        for (const operation of [...batchOperations].reverse()) operation.rollback();
        throw error;
      }
    });
    flushQueue = batch.catch(() => undefined);
    return batch;
  };

  return {
    create(input) {
      const revision =
        order
          .map((id) => byId.get(id)!)
          .filter(
            (item) => item.projectId === input.projectId && item.environment === input.environment
          ).length + 1;
      const deployment: WorkspaceDeployment = {
        ...input,
        id: `wdep_${randomUUID().replaceAll("-", "")}`,
        imageDigest: input.imageDigest ?? input.imageTag,
        containerName: input.containerName ?? `evcp-${input.environment}-${input.slug}`,
        revision,
        healthStatus: "pending",
        createdAt: new Date().toISOString()
      };
      byId.set(deployment.id, deployment);
      order.push(deployment.id);
      enqueue(
        deployment.id,
        (transaction) =>
          transaction.workspaceDeploymentRevision.create({ data: toRecord(deployment) }),
        () => {
          byId.delete(deployment.id);
          const index = order.indexOf(deployment.id);
          if (index >= 0) order.splice(index, 1);
        }
      );
      return deployment;
    },
    updateRuntime(id, input) {
      const current = byId.get(id);
      if (!current) throw new Error(`unknown deployment '${id}'`);
      const next = { ...current, ...input };
      byId.set(id, next);
      enqueue(
        id,
        (transaction) =>
          transaction.workspaceDeploymentRevision.update({ where: { id }, data: input }),
        () => {
          if (byId.has(id)) byId.set(id, current);
        }
      );
      return next;
    },
    updateHealth(id, healthStatus) {
      const current = byId.get(id);
      if (!current) throw new Error(`unknown deployment '${id}'`);
      const next = { ...current, healthStatus };
      byId.set(id, next);
      enqueue(
        id,
        (transaction) =>
          transaction.workspaceDeploymentRevision.update({ where: { id }, data: { healthStatus } }),
        () => {
          if (byId.has(id)) byId.set(id, current);
        }
      );
      return next;
    },
    discard(id) {
      const discarded = operations.filter((operation) => operation.deploymentId === id);
      operations = operations.filter((operation) => operation.deploymentId !== id);
      for (const operation of discarded.reverse()) operation.rollback();
    },
    remove(id) {
      const current = byId.get(id);
      if (!current) return;
      byId.delete(id);
      const index = order.indexOf(id);
      if (index >= 0) order.splice(index, 1);
      enqueue(
        id,
        (transaction) => transaction.workspaceDeploymentRevision.deleteMany({ where: { id } }),
        () => {
          byId.set(id, current);
          order.splice(Math.min(index < 0 ? order.length : index, order.length), 0, id);
        }
      );
    },
    removeProject(projectId) {
      const projectDeploymentIds = new Set(
        order.filter((id) => byId.get(id)?.projectId === projectId)
      );
      const discarded = operations.filter((operation) =>
        projectDeploymentIds.has(operation.deploymentId)
      );
      operations = operations.filter(
        (operation) => !projectDeploymentIds.has(operation.deploymentId)
      );
      for (const operation of discarded.reverse()) operation.rollback();

      const removed = order.flatMap((id, index) => {
        const deployment = byId.get(id);
        return deployment?.projectId === projectId ? [{ id, index, deployment }] : [];
      });
      for (const { id } of removed) {
        byId.delete(id);
        order.splice(order.indexOf(id), 1);
      }
      enqueue(
        `project:${projectId}`,
        (transaction) =>
          transaction.workspaceDeploymentRevision.deleteMany({ where: { projectId } }),
        () => {
          for (const { id, index, deployment } of removed) {
            byId.set(id, deployment);
            order.splice(Math.min(index, order.length), 0, id);
          }
        }
      );
    },
    list(projectId) {
      return order
        .map((id) => byId.get(id)!)
        .filter((item) => item.projectId === projectId)
        .reverse();
    },
    getCurrent(slug, environment: EnvironmentName = "production") {
      for (let index = order.length - 1; index >= 0; index -= 1) {
        const item = byId.get(order[index])!;
        if (
          item.slug === slug &&
          item.environment === environment &&
          item.healthStatus === "healthy"
        )
          return item;
      }
      return null;
    },
    flush
  };
}

async function loadClient(databaseUrl?: string): Promise<DeploymentRevisionClient> {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as DeploymentRevisionClient;
}

function mapRecord(record: RevisionRecord): WorkspaceDeployment {
  return {
    ...record,
    environment: record.environment as EnvironmentName,
    healthStatus: record.healthStatus as DeploymentHealthStatus,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt
  };
}

function toRecord(deployment: WorkspaceDeployment): RevisionRecord {
  return { ...deployment, createdAt: new Date(deployment.createdAt) };
}
