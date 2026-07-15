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
      data: { healthStatus: string };
    }): Promise<RevisionRecord>;
  };
}

export async function createPrismaDeploymentStore(
  databaseUrl = process.env.DATABASE_URL,
  injectedClient?: DeploymentRevisionClient
): Promise<DeploymentStore> {
  const client = injectedClient ?? (await loadClient(databaseUrl));
  const rows = await client.workspaceDeploymentRevision.findMany({ orderBy: { createdAt: "asc" } });
  const byId = new Map(rows.map((row) => [row.id, mapRecord(row)]));
  const order = rows.map((row) => row.id);
  let writes = Promise.resolve();
  let writeFailure: { error: unknown } | null = null;
  let rollbacks: Array<() => void> = [];
  const enqueue = (operation: () => Promise<unknown>, rollback: () => void) => {
    rollbacks.push(rollback);
    writes = writes.then(async () => {
      if (writeFailure) {
        rollback();
        return;
      }
      try {
        await operation();
      } catch (error) {
        for (const revert of [...rollbacks].reverse()) revert();
        rollbacks = [];
        writeFailure = { error };
      }
    });
  };
  const flush = async () => {
    await writes;
    if (!writeFailure) {
      rollbacks = [];
      return;
    }
    const failure = writeFailure.error;
    writeFailure = null;
    rollbacks = [];
    throw failure;
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
        () => client.workspaceDeploymentRevision.create({ data: toRecord(deployment) }),
        () => {
          byId.delete(deployment.id);
          const index = order.indexOf(deployment.id);
          if (index >= 0) order.splice(index, 1);
        }
      );
      return deployment;
    },
    updateHealth(id, healthStatus) {
      const current = byId.get(id);
      if (!current) throw new Error(`unknown deployment '${id}'`);
      const next = { ...current, healthStatus };
      byId.set(id, next);
      enqueue(
        () => client.workspaceDeploymentRevision.update({ where: { id }, data: { healthStatus } }),
        () => {
          if (byId.has(id)) byId.set(id, current);
        }
      );
      return next;
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
