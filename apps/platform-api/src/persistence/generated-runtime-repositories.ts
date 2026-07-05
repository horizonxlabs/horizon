import type {
  AppManifest,
  DeploymentRecord,
  GeneratedRuntimeHealth,
  GeneratedRuntimeLogSample,
  GeneratedRuntimeMetrics,
  GeneratedRuntimeMigrationDryRun,
  GeneratedRuntimeOpenApiContract,
  GeneratedRuntimeOverview,
  GeneratedRuntimeReadiness,
  GeneratedRuntimeSchemaAccessCheck,
  GeneratedRuntimeSchemaIsolation,
  PlatformProject,
  PlatformUser
} from "../platform-services";
import { PermissionError } from "../platform-services";

type DateValue = Date | string;
type JsonValue = unknown;

interface GeneratedAppRuntimeRecord {
  id: string;
  appId: string;
  projectId: string;
  deploymentRecordId: string;
  artifactRoot: string;
  requiredPaths: string[];
  containerName: string;
  imageTag: string;
  route: string;
  healthEndpoint: string;
  readyEndpoint: string;
  metricsEndpoint: string;
  status: string;
  createdAt?: DateValue;
  updatedAt?: DateValue;
}

interface GeneratedAppSchemaGrantRecord {
  id: string;
  runtimeId: string;
  schemaName: string;
  dbUser: string;
  allowedSchemas: string[];
  deniedSchemas: string[];
  status: string;
  createdAt?: DateValue;
}

interface GeneratedAppHealthCheckRecord {
  id: string;
  runtimeId: string;
  healthStatus: string;
  readinessStatus: string;
  dependencies: JsonValue;
  readinessGates: string[];
  checkedAt: DateValue;
}

interface GeneratedAppRuntimeLogRecord {
  id: string;
  runtimeId: string;
  appId: string;
  deploymentId: string;
  requestId: string;
  severity: string;
  message: string;
  metadata: JsonValue;
  occurredAt: DateValue;
}

interface GeneratedAppRuntimeMetricRecord {
  id: string;
  runtimeId: string;
  requestCount: number;
  errorCount: number;
  latencyP95Ms: number;
  window: string;
  measuredAt: DateValue;
}

interface GeneratedAppOpenApiContractRecord {
  id: string;
  runtimeId: string;
  version: string;
  openapiPath: string;
  paths: string[];
  pathCount: number;
  createdAt?: DateValue;
}

interface GeneratedAppMigrationReportRecord {
  id: string;
  runtimeId: string;
  deploymentRecordId: string;
  migrationId: string;
  dryRunStatus: string;
  destructiveChanges: string[];
  requiredApprovals: string[];
  approvalId?: string | null;
  createdAt: DateValue;
}

export interface GeneratedRuntimePersistenceClient {
  generatedAppRuntime: {
    findUnique(args: { where: { deploymentRecordId?: string; id?: string } }): Promise<GeneratedAppRuntimeRecord | null>;
    create(args: { data: GeneratedAppRuntimeRecord }): Promise<GeneratedAppRuntimeRecord>;
  };
  generatedAppSchemaGrant: {
    findFirst(args: { where: { runtimeId: string } }): Promise<GeneratedAppSchemaGrantRecord | null>;
    create(args: { data: GeneratedAppSchemaGrantRecord }): Promise<GeneratedAppSchemaGrantRecord>;
  };
  generatedAppHealthCheck: {
    findMany(args: { where: { runtimeId: string }; orderBy?: { checkedAt?: "asc" | "desc" } }): Promise<GeneratedAppHealthCheckRecord[]>;
    create(args: { data: GeneratedAppHealthCheckRecord }): Promise<GeneratedAppHealthCheckRecord>;
  };
  generatedAppRuntimeLog: {
    findMany(args: { where: { runtimeId: string }; orderBy?: { occurredAt?: "asc" | "desc" } }): Promise<GeneratedAppRuntimeLogRecord[]>;
    create(args: { data: GeneratedAppRuntimeLogRecord }): Promise<GeneratedAppRuntimeLogRecord>;
  };
  generatedAppRuntimeMetric: {
    findMany(args: { where: { runtimeId: string }; orderBy?: { measuredAt?: "asc" | "desc" } }): Promise<GeneratedAppRuntimeMetricRecord[]>;
    create(args: { data: GeneratedAppRuntimeMetricRecord }): Promise<GeneratedAppRuntimeMetricRecord>;
  };
  generatedAppOpenApiContract: {
    findUnique(args: { where: { runtimeId: string } }): Promise<GeneratedAppOpenApiContractRecord | null>;
    create(args: { data: GeneratedAppOpenApiContractRecord }): Promise<GeneratedAppOpenApiContractRecord>;
  };
  generatedAppMigrationReport: {
    findMany(args: { where: { runtimeId: string }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<GeneratedAppMigrationReportRecord[]>;
    create(args: { data: GeneratedAppMigrationReportRecord }): Promise<GeneratedAppMigrationReportRecord>;
  };
}

export class GeneratedRuntimeRepositoryBackedService {
  private readonly requiredPaths = [
    "app.manifest.json",
    "package.json",
    "frontend/",
    "backend/",
    "prisma/",
    "openapi/",
    "tests/",
    "README.md"
  ];

  constructor(private readonly client: GeneratedRuntimePersistenceClient) {}

  async getRuntimeOverview(
    actor: PlatformUser,
    input: { project: PlatformProject; manifest: AppManifest; deployment: DeploymentRecord }
  ): Promise<GeneratedRuntimeOverview> {
    requireAdmin(actor);
    const runtime = await this.ensureRuntime(input);
    const schemaGrant = await this.ensureSchemaGrant(runtime, input.manifest);
    const health = await this.ensureHealth(runtime, input.manifest, input.deployment);
    const logSample = await this.ensureLogSample(runtime, input.manifest, input.deployment);
    const metrics = await this.ensureMetrics(runtime);
    const openApi = await this.ensureOpenApi(runtime, input.manifest);
    const migrationDryRun = await this.ensureBaselineMigration(runtime, input.manifest, input.deployment);

    return {
      projectId: runtime.projectId,
      appId: runtime.appId,
      deploymentId: runtime.deploymentRecordId,
      artifactContract: {
        root: runtime.artifactRoot,
        requiredPaths: [...runtime.requiredPaths]
      },
      container: {
        status: runtime.status === "running" ? "running" : runtime.status === "failed" ? "failed" : "stopped",
        containerName: runtime.containerName,
        imageTag: runtime.imageTag,
        route: runtime.route,
        healthEndpoint: runtime.healthEndpoint,
        readyEndpoint: runtime.readyEndpoint,
        metricsEndpoint: runtime.metricsEndpoint
      },
      schemaIsolation: mapSchemaGrant(schemaGrant),
      health: mapHealth(health, runtime.appId, runtime.deploymentRecordId),
      readiness: mapReadiness(health),
      logSample: mapLogSample(logSample),
      metrics: mapMetrics(metrics),
      openApi: mapOpenApi(openApi),
      migrationDryRun: mapMigration(migrationDryRun)
    };
  }

  async getRuntimeHealth(
    actor: PlatformUser,
    input: { project: PlatformProject; manifest: AppManifest; deployment: DeploymentRecord }
  ): Promise<{ health: GeneratedRuntimeHealth; readiness: GeneratedRuntimeReadiness; metrics: GeneratedRuntimeMetrics; logSample: GeneratedRuntimeLogSample }> {
    const overview = await this.getRuntimeOverview(actor, input);
    return {
      health: overview.health,
      readiness: overview.readiness,
      metrics: overview.metrics,
      logSample: overview.logSample
    };
  }

  async getOpenApiContract(
    actor: PlatformUser,
    input: { project: PlatformProject; manifest: AppManifest; deployment: DeploymentRecord }
  ): Promise<GeneratedRuntimeOpenApiContract> {
    const overview = await this.getRuntimeOverview(actor, input);
    return overview.openApi;
  }

  async checkSchemaAccess(
    actor: PlatformUser,
    input: {
      project: PlatformProject;
      manifest: AppManifest;
      deployment: DeploymentRecord;
      attemptedSchema: string;
      operation: string;
    }
  ): Promise<GeneratedRuntimeSchemaAccessCheck> {
    const overview = await this.getRuntimeOverview(actor, input);
    const attemptedSchema = input.attemptedSchema.trim();
    const operation = input.operation.trim() || "select";
    const allowed = overview.schemaIsolation.allowedSchemas.includes(attemptedSchema);
    return {
      projectId: overview.projectId,
      attemptedSchema,
      operation,
      allowed,
      reason: allowed ? "assigned_schema_allowed" : "cross_schema_access_denied",
      evidence: allowed
        ? `${overview.schemaIsolation.dbUser} may ${operation} within ${overview.schemaIsolation.schemaName}`
        : `${overview.schemaIsolation.dbUser} is scoped to ${overview.schemaIsolation.schemaName} and cannot ${operation} ${attemptedSchema}`
    };
  }

  async runMigrationDryRun(
    actor: PlatformUser,
    input: {
      project: PlatformProject;
      manifest: AppManifest;
      deployment: DeploymentRecord;
      migrationId: string;
      destructiveChanges?: string[];
      approvalId?: string;
    }
  ): Promise<GeneratedRuntimeMigrationDryRun> {
    requireAdmin(actor);
    const runtime = await this.ensureRuntime(input);
    await this.ensureSchemaGrant(runtime, input.manifest);
    await this.ensureHealth(runtime, input.manifest, input.deployment);
    await this.ensureLogSample(runtime, input.manifest, input.deployment);
    await this.ensureMetrics(runtime);
    await this.ensureOpenApi(runtime, input.manifest);
    await this.ensureBaselineMigration(runtime, input.manifest, input.deployment);

    const destructiveChanges = [...(input.destructiveChanges ?? [])];
    const approvalId = input.approvalId?.trim() || undefined;
    const blocked = destructiveChanges.length > 0 && !approvalId;
    const existing = await this.client.generatedAppMigrationReport.findMany({ where: { runtimeId: runtime.id }, orderBy: { createdAt: "asc" } });
    const record = await this.client.generatedAppMigrationReport.create({
      data: {
        id: `gamigration_${runtime.id}_${String(existing.length + 1).padStart(4, "0")}`,
        runtimeId: runtime.id,
        deploymentRecordId: input.deployment.id,
        migrationId: input.migrationId.trim() || `mig_${runtime.deploymentRecordId}`,
        dryRunStatus: blocked ? "blocked" : "passed",
        destructiveChanges,
        requiredApprovals: blocked ? ["Developer Reviewer", "Data Owner"] : [],
        approvalId,
        createdAt: new Date()
      }
    });
    return mapMigration(record);
  }

  private async ensureRuntime(input: { project: PlatformProject; manifest: AppManifest; deployment: DeploymentRecord }): Promise<GeneratedAppRuntimeRecord> {
    const existing = await this.client.generatedAppRuntime.findUnique({ where: { deploymentRecordId: input.deployment.id } });
    if (existing) return existing;
    const slug = input.manifest.app.slug;
    return this.client.generatedAppRuntime.create({
      data: {
        id: `garun_${slugToId(slug)}_${input.deployment.id}`,
        appId: input.manifest.appId,
        projectId: input.project.id,
        deploymentRecordId: input.deployment.id,
        artifactRoot: `generated-apps/${slug}`,
        requiredPaths: [...this.requiredPaths],
        containerName: `evcp-app-${slug}-${input.deployment.id}`,
        imageTag: `${slug}:${input.manifest.manifestVersion}`,
        route: input.deployment.route,
        healthEndpoint: `/apps/${slug}/health`,
        readyEndpoint: `/apps/${slug}/ready`,
        metricsEndpoint: `/apps/${slug}/metrics`,
        status: "running",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }

  private async ensureSchemaGrant(runtime: GeneratedAppRuntimeRecord, manifest: AppManifest): Promise<GeneratedAppSchemaGrantRecord> {
    const existing = await this.client.generatedAppSchemaGrant.findFirst({ where: { runtimeId: runtime.id } });
    if (existing) return existing;
    const slug = manifest.app.slug;
    return this.client.generatedAppSchemaGrant.create({
      data: {
        id: `gaschema_${runtime.id}`,
        runtimeId: runtime.id,
        schemaName: manifest.database.schemaName,
        dbUser: `app_user_${slugToId(slug)}`,
        allowedSchemas: [manifest.database.schemaName],
        deniedSchemas: ["public", "platform", "app_payroll"],
        status: "active",
        createdAt: new Date()
      }
    });
  }

  private async ensureHealth(
    runtime: GeneratedAppRuntimeRecord,
    manifest: AppManifest,
    deployment: DeploymentRecord
  ): Promise<GeneratedAppHealthCheckRecord> {
    const existing = await this.latestHealth(runtime.id);
    if (existing) return existing;
    return this.client.generatedAppHealthCheck.create({
      data: {
        id: `gahealth_${runtime.id}`,
        runtimeId: runtime.id,
        healthStatus: "healthy",
        readinessStatus: "ready",
        dependencies: {
          database: "healthy",
          platformAuth: "ready",
          route: "ready"
        },
        readinessGates: ["artifact_contract_present", "migrations_applied", "schema_grant_active", "platform_auth_ready", "route_registered"],
        checkedAt: deployment.publishedAt || manifest.generatedAt
      }
    });
  }

  private async ensureLogSample(
    runtime: GeneratedAppRuntimeRecord,
    manifest: AppManifest,
    deployment: DeploymentRecord
  ): Promise<GeneratedAppRuntimeLogRecord> {
    const existing = await this.latestLog(runtime.id);
    if (existing) return existing;
    const slug = manifest.app.slug;
    return this.client.generatedAppRuntimeLog.create({
      data: {
        id: `galog_${runtime.id}`,
        runtimeId: runtime.id,
        appId: manifest.appId,
        deploymentId: deployment.id,
        requestId: `req_${slugToId(slug)}_001`,
        severity: "info",
        message: "Generated app runtime accepted authenticated request",
        metadata: { projectId: runtime.projectId },
        occurredAt: deployment.publishedAt || manifest.generatedAt
      }
    });
  }

  private async ensureMetrics(runtime: GeneratedAppRuntimeRecord): Promise<GeneratedAppRuntimeMetricRecord> {
    const existing = await this.latestMetric(runtime.id);
    if (existing) return existing;
    return this.client.generatedAppRuntimeMetric.create({
      data: {
        id: `gametric_${runtime.id}`,
        runtimeId: runtime.id,
        requestCount: 128,
        errorCount: 0,
        latencyP95Ms: 42,
        window: "last_15m",
        measuredAt: new Date()
      }
    });
  }

  private async ensureOpenApi(runtime: GeneratedAppRuntimeRecord, manifest: AppManifest): Promise<GeneratedAppOpenApiContractRecord> {
    const existing = await this.client.generatedAppOpenApiContract.findUnique({ where: { runtimeId: runtime.id } });
    if (existing) return existing;
    return this.client.generatedAppOpenApiContract.create({
      data: {
        id: `gaopenapi_${runtime.id}`,
        runtimeId: runtime.id,
        version: "1.0.0",
        openapiPath: `generated-apps/${manifest.app.slug}/openapi/openapi.json`,
        paths: ["/api/leave-requests", "/api/leave-requests/{id}", "/api/approval-steps", "/api/runtime/health"],
        pathCount: 4,
        createdAt: new Date()
      }
    });
  }

  private async ensureBaselineMigration(
    runtime: GeneratedAppRuntimeRecord,
    manifest: AppManifest,
    deployment: DeploymentRecord
  ): Promise<GeneratedAppMigrationReportRecord> {
    const reports = await this.client.generatedAppMigrationReport.findMany({ where: { runtimeId: runtime.id }, orderBy: { createdAt: "asc" } });
    if (reports.length) return reports.at(-1) as GeneratedAppMigrationReportRecord;
    return this.client.generatedAppMigrationReport.create({
      data: {
        id: `gamigration_${runtime.id}_baseline`,
        runtimeId: runtime.id,
        deploymentRecordId: deployment.id,
        migrationId: `mig_${slugToId(manifest.app.slug)}_baseline`,
        dryRunStatus: "passed",
        destructiveChanges: [],
        requiredApprovals: [],
        createdAt: deployment.publishedAt || manifest.generatedAt
      }
    });
  }

  private async latestHealth(runtimeId: string): Promise<GeneratedAppHealthCheckRecord | null> {
    const records = await this.client.generatedAppHealthCheck.findMany({ where: { runtimeId }, orderBy: { checkedAt: "asc" } });
    return records.at(-1) ?? null;
  }

  private async latestLog(runtimeId: string): Promise<GeneratedAppRuntimeLogRecord | null> {
    const records = await this.client.generatedAppRuntimeLog.findMany({ where: { runtimeId }, orderBy: { occurredAt: "asc" } });
    return records.at(-1) ?? null;
  }

  private async latestMetric(runtimeId: string): Promise<GeneratedAppRuntimeMetricRecord | null> {
    const records = await this.client.generatedAppRuntimeMetric.findMany({ where: { runtimeId }, orderBy: { measuredAt: "asc" } });
    return records.at(-1) ?? null;
  }
}

export function createGeneratedRuntimeRepositoryBackedService(client: GeneratedRuntimePersistenceClient): GeneratedRuntimeRepositoryBackedService {
  return new GeneratedRuntimeRepositoryBackedService(client);
}

export async function createPrismaGeneratedRuntimePersistence(databaseUrl = process.env.DATABASE_URL): Promise<{
  client: GeneratedRuntimePersistenceClient;
  service: GeneratedRuntimeRepositoryBackedService;
}> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as GeneratedRuntimePersistenceClient;
  return { client, service: createGeneratedRuntimeRepositoryBackedService(client) };
}

export class MemoryGeneratedRuntimePersistenceClient implements GeneratedRuntimePersistenceClient {
  private readonly runtimes: GeneratedAppRuntimeRecord[] = [];
  private readonly schemaGrants: GeneratedAppSchemaGrantRecord[] = [];
  private readonly healthChecks: GeneratedAppHealthCheckRecord[] = [];
  private readonly runtimeLogs: GeneratedAppRuntimeLogRecord[] = [];
  private readonly runtimeMetrics: GeneratedAppRuntimeMetricRecord[] = [];
  private readonly openApiContracts: GeneratedAppOpenApiContractRecord[] = [];
  private readonly migrationReports: GeneratedAppMigrationReportRecord[] = [];

  readonly generatedAppRuntime = {
    findUnique: async ({ where }: { where: { deploymentRecordId?: string; id?: string } }) =>
      this.runtimes.find((record) => (where.deploymentRecordId ? record.deploymentRecordId === where.deploymentRecordId : record.id === where.id)) ?? null,
    create: async ({ data }: { data: GeneratedAppRuntimeRecord }) => {
      this.runtimes.push({ ...data, requiredPaths: [...data.requiredPaths] });
      return { ...data, requiredPaths: [...data.requiredPaths] };
    }
  };

  readonly generatedAppSchemaGrant = {
    findFirst: async ({ where }: { where: { runtimeId: string } }) =>
      this.schemaGrants.find((record) => record.runtimeId === where.runtimeId) ?? null,
    create: async ({ data }: { data: GeneratedAppSchemaGrantRecord }) => {
      this.schemaGrants.push({ ...data, allowedSchemas: [...data.allowedSchemas], deniedSchemas: [...data.deniedSchemas] });
      return { ...data, allowedSchemas: [...data.allowedSchemas], deniedSchemas: [...data.deniedSchemas] };
    }
  };

  readonly generatedAppHealthCheck = {
    findMany: async ({ where, orderBy }: { where: { runtimeId: string }; orderBy?: { checkedAt?: "asc" | "desc" } }) =>
      orderByDate(this.healthChecks.filter((record) => record.runtimeId === where.runtimeId), "checkedAt", orderBy?.checkedAt),
    create: async ({ data }: { data: GeneratedAppHealthCheckRecord }) => {
      this.healthChecks.push({ ...data, readinessGates: [...data.readinessGates] });
      return { ...data, readinessGates: [...data.readinessGates] };
    }
  };

  readonly generatedAppRuntimeLog = {
    findMany: async ({ where, orderBy }: { where: { runtimeId: string }; orderBy?: { occurredAt?: "asc" | "desc" } }) =>
      orderByDate(this.runtimeLogs.filter((record) => record.runtimeId === where.runtimeId), "occurredAt", orderBy?.occurredAt),
    create: async ({ data }: { data: GeneratedAppRuntimeLogRecord }) => {
      this.runtimeLogs.push({ ...data });
      return { ...data };
    }
  };

  readonly generatedAppRuntimeMetric = {
    findMany: async ({ where, orderBy }: { where: { runtimeId: string }; orderBy?: { measuredAt?: "asc" | "desc" } }) =>
      orderByDate(this.runtimeMetrics.filter((record) => record.runtimeId === where.runtimeId), "measuredAt", orderBy?.measuredAt),
    create: async ({ data }: { data: GeneratedAppRuntimeMetricRecord }) => {
      this.runtimeMetrics.push({ ...data });
      return { ...data };
    }
  };

  readonly generatedAppOpenApiContract = {
    findUnique: async ({ where }: { where: { runtimeId: string } }) =>
      this.openApiContracts.find((record) => record.runtimeId === where.runtimeId) ?? null,
    create: async ({ data }: { data: GeneratedAppOpenApiContractRecord }) => {
      this.openApiContracts.push({ ...data, paths: [...data.paths] });
      return { ...data, paths: [...data.paths] };
    }
  };

  readonly generatedAppMigrationReport = {
    findMany: async ({ where, orderBy }: { where: { runtimeId: string }; orderBy?: { createdAt?: "asc" | "desc" } }) =>
      orderByDate(this.migrationReports.filter((record) => record.runtimeId === where.runtimeId), "createdAt", orderBy?.createdAt),
    create: async ({ data }: { data: GeneratedAppMigrationReportRecord }) => {
      this.migrationReports.push({
        ...data,
        destructiveChanges: [...data.destructiveChanges],
        requiredApprovals: [...data.requiredApprovals]
      });
      return {
        ...data,
        destructiveChanges: [...data.destructiveChanges],
        requiredApprovals: [...data.requiredApprovals]
      };
    }
  };
}

function requireAdmin(actor: PlatformUser): void {
  if (actor.role !== "admin") throw new PermissionError(`Role ${actor.role} cannot access this resource`);
}

function slugToId(slug: string): string {
  return slug.replace(/[^a-z0-9]+/gi, "_");
}

function toIsoString(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : value;
}

function orderByDate<T extends Record<K, DateValue>, K extends keyof T>(records: T[], key: K, direction: "asc" | "desc" = "asc"): T[] {
  return [...records].sort((left, right) => {
    const diff = new Date(left[key]).getTime() - new Date(right[key]).getTime();
    return direction === "desc" ? -diff : diff;
  });
}

function mapSchemaGrant(record: GeneratedAppSchemaGrantRecord): GeneratedRuntimeSchemaIsolation {
  return {
    schemaName: record.schemaName,
    dbUser: record.dbUser,
    allowedSchemas: [...record.allowedSchemas],
    deniedSchemas: [...record.deniedSchemas]
  };
}

function mapHealth(record: GeneratedAppHealthCheckRecord, appId: string, deploymentId: string): GeneratedRuntimeHealth {
  return {
    status: record.healthStatus === "healthy" ? "healthy" : record.healthStatus === "degraded" ? "degraded" : "down",
    appId,
    deploymentId,
    dependencies: normalizeDependencies(record.dependencies)
  };
}

function mapReadiness(record: GeneratedAppHealthCheckRecord): GeneratedRuntimeReadiness {
  return {
    ready: record.readinessStatus === "ready",
    gates: [...record.readinessGates]
  };
}

function mapLogSample(record: GeneratedAppRuntimeLogRecord): GeneratedRuntimeLogSample {
  return {
    appId: record.appId,
    deploymentId: record.deploymentId,
    requestId: record.requestId,
    severity: record.severity === "warning" ? "warning" : record.severity === "error" ? "error" : "info",
    message: record.message,
    timestamp: toIsoString(record.occurredAt)
  };
}

function mapMetrics(record: GeneratedAppRuntimeMetricRecord): GeneratedRuntimeMetrics {
  return {
    requestCount: record.requestCount,
    errorCount: record.errorCount,
    latencyP95Ms: record.latencyP95Ms,
    window: record.window
  };
}

function mapOpenApi(record: GeneratedAppOpenApiContractRecord): GeneratedRuntimeOpenApiContract {
  return {
    version: record.version,
    openapiPath: record.openapiPath,
    paths: [...record.paths],
    pathCount: record.pathCount
  };
}

function mapMigration(record: GeneratedAppMigrationReportRecord): GeneratedRuntimeMigrationDryRun {
  return {
    migrationId: record.migrationId,
    deploymentId: record.deploymentRecordId,
    status: record.dryRunStatus === "blocked" ? "blocked" : "passed",
    destructiveChanges: [...record.destructiveChanges],
    requiredApprovals: [...record.requiredApprovals],
    approvalId: record.approvalId ?? undefined
  };
}

function normalizeDependencies(value: JsonValue): Record<string, "healthy" | "ready"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, "healthy" | "ready"> = {};
  for (const [key, raw] of Object.entries(value)) {
    output[key] = raw === "ready" ? "ready" : "healthy";
  }
  return output;
}
