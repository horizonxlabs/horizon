import { getMockPermissions } from "@evcp/auth-sdk";
import type { PlatformRole } from "@evcp/types";
import type { AuditEvent, AuditFilterInput, CreateProjectInput, PlatformProject, PlatformUser } from "../platform-services";
import { PermissionError, ValidationError } from "../platform-services";

type JsonRecord = Record<string, unknown>;
type UserStatus = PlatformUser["status"];
type ProjectStatus = PlatformProject["status"];
type AuditSeverity = AuditEvent["severity"];

interface PlatformRoleRecord {
  id: string;
  key: string;
  name: string;
  permissions: string[];
}

interface PlatformUserRoleRecord {
  role: PlatformRoleRecord;
}

interface PlatformUserRecord {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roles?: PlatformUserRoleRecord[];
}

interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  ownerUserId: string;
  appType: string | null;
  businessProblem: string | null;
  targetDepartment: string | null;
  intendedUsers: string[];
  dataSensitivity: PlatformProject["dataSensitivity"] | string | null;
  activeFrontendCheckpointId?: string | null;
  createdAt: Date | string;
  apps?: Array<{ id: string; slug?: string }>;
}

interface AuditLogRecord {
  id: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  severity: AuditSeverity;
  metadata: unknown;
  occurredAt: Date | string;
}

interface FindUniqueUserArgs {
  where: { email?: string; id?: string };
  include?: { roles?: { include?: { role?: boolean } } };
}

interface FindManyProjectArgs {
  where?: Partial<Pick<ProjectRecord, "ownerUserId">>;
  include?: { apps?: boolean };
  orderBy?: { createdAt?: "asc" | "desc" };
}

interface UpsertProjectArgs {
  where: { slug: string };
  update: Partial<ProjectRecord>;
  create: ProjectRecord;
  include?: { apps?: boolean };
}

interface CreateAuditArgs {
  data: Omit<AuditLogRecord, "occurredAt"> & { occurredAt?: Date | string };
}

interface FindManyAuditArgs {
  where?: {
    actorUserId?: string;
    action?: string;
    severity?: AuditSeverity;
    resourceType?: string;
    resourceId?: string;
    occurredAt?: {
      gte?: Date;
      lte?: Date;
    };
    metadata?: {
      path?: string[];
      equals?: string;
    };
  };
  orderBy?: { occurredAt?: "asc" | "desc" };
}

export interface CorePersistenceClient {
  platformUser: {
    findUnique(args: FindUniqueUserArgs): Promise<PlatformUserRecord | null>;
  };
  project: {
    findMany(args: FindManyProjectArgs): Promise<ProjectRecord[]>;
    upsert(args: UpsertProjectArgs): Promise<ProjectRecord>;
  };
  auditLog: {
    create(args: CreateAuditArgs): Promise<AuditLogRecord>;
    findMany(args: FindManyAuditArgs): Promise<AuditLogRecord[]>;
  };
}

export interface CoreRepositories {
  users: PlatformUserRepository;
  projects: ProjectRepository;
  audits: AuditLogRepository;
}

export class PlatformUserRepository {
  constructor(private readonly client: CorePersistenceClient) {}

  async getByEmail(email: string): Promise<PlatformUser> {
    const record = await this.client.platformUser.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } }
    });

    if (!record) throw new ValidationError(`Unknown platform user: ${email}`);
    return mapPlatformUser(record);
  }
}

export class ProjectRepository {
  constructor(private readonly client: CorePersistenceClient) {}

  async listForActor(actor: PlatformUser): Promise<PlatformProject[]> {
    const records = await this.client.project.findMany({
      where: actor.role === "admin" ? undefined : { ownerUserId: actor.id },
      include: { apps: true },
      orderBy: { createdAt: "asc" }
    });
    return records.map(mapProject);
  }

  async createOrReplace(input: CreateProjectInput): Promise<PlatformProject> {
    if (!["admin", "creator"].includes(input.actor.role)) {
      throw new PermissionError(`Role ${input.actor.role} cannot create projects`);
    }
    if (!input.name.trim()) throw new ValidationError("Project name is required");
    if (!input.slug.trim()) throw new ValidationError("Project slug is required");

    const id = `prj_${slugToId(input.slug)}`;
    const now = new Date();
    const data = {
      id,
      slug: input.slug,
      name: input.name,
      status: "draft" as const,
      ownerUserId: input.actor.id,
      appType: input.appType ?? "Workflow App",
      businessProblem: input.businessProblem ?? "Capture the business problem before PRD generation.",
      targetDepartment: input.targetDepartment ?? "Business Team",
      intendedUsers: input.intendedUsers ?? ["Business User"],
      dataSensitivity: input.dataSensitivity ?? "internal",
      activeFrontendCheckpointId: null,
      createdAt: now
    };

    const record = await this.client.project.upsert({
      where: { slug: input.slug },
      update: data,
      create: data,
      include: { apps: true }
    });

    return mapProject(record);
  }
}

export class AuditLogRepository {
  constructor(private readonly client: CorePersistenceClient) {}

  async record(input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> & Partial<Pick<AuditEvent, "severity" | "metadata">>): Promise<AuditEvent> {
    const record = await this.client.auditLog.create({
      data: {
        id: `aud_${Date.now().toString(36)}_${slugToId(input.resourceId).slice(0, 20)}`,
        actorUserId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        severity: input.severity ?? "info",
        metadata: input.metadata ?? {}
      }
    });
    return mapAudit(record);
  }

  async filter(input: AuditFilterInput): Promise<AuditEvent[]> {
    const records = await this.client.auditLog.findMany({
      where: {
        actorUserId: input.actorId,
        action: input.action,
        severity: input.severity,
        occurredAt: input.dateFrom || input.dateTo ? {
          gte: input.dateFrom ? new Date(input.dateFrom) : undefined,
          lte: input.dateTo ? new Date(input.dateTo) : undefined
        } : undefined
      },
      orderBy: { occurredAt: "asc" }
    });
    return records.map(mapAudit).filter((event) => {
      if (input.projectId && event.resourceId !== input.projectId && event.metadata.projectId !== input.projectId) return false;
      if (input.appId && event.resourceId !== input.appId && event.metadata.appId !== input.appId) return false;
      return true;
    });
  }
}

export class CoreRepositoryBackedService {
  constructor(private readonly repositories: CoreRepositories) {}

  getUserByEmail(email: string): Promise<PlatformUser> {
    return this.repositories.users.getByEmail(email);
  }

  createProject(input: CreateProjectInput): Promise<PlatformProject> {
    return this.repositories.projects.createOrReplace(input);
  }

  listProjects(actor: PlatformUser): Promise<PlatformProject[]> {
    return this.repositories.projects.listForActor(actor);
  }

  recordAudit(input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> & Partial<Pick<AuditEvent, "severity" | "metadata">>): Promise<AuditEvent> {
    return this.repositories.audits.record(input);
  }

  filterAudit(input: AuditFilterInput): Promise<AuditEvent[]> {
    return this.repositories.audits.filter(input);
  }
}

export class MemoryCorePersistenceClient implements CorePersistenceClient {
  readonly platformUser: CorePersistenceClient["platformUser"];
  readonly project: CorePersistenceClient["project"];
  readonly auditLog: CorePersistenceClient["auditLog"];

  private readonly users: PlatformUserRecord[];
  private readonly projects: ProjectRecord[];
  private readonly audits: AuditLogRecord[];

  constructor(seed: { users?: PlatformUserRecord[]; projects?: ProjectRecord[]; audits?: AuditLogRecord[] } = {}) {
    this.users = seed.users ?? defaultUsers();
    this.projects = seed.projects ?? [];
    this.audits = seed.audits ?? [];

    this.platformUser = {
      findUnique: async ({ where }) => this.users.find((user) => matchesUniqueUser(user, where)) ?? null
    };
    this.project = {
      findMany: async ({ where, orderBy }) => sortByCreatedAt(this.projects.filter((project) => {
        if (!where?.ownerUserId) return true;
        return project.ownerUserId === where.ownerUserId;
      }), orderBy?.createdAt),
      upsert: async ({ where, update, create }) => {
        const existingIndex = this.projects.findIndex((project) => project.slug === where.slug);
        if (existingIndex >= 0) {
          const existing = this.projects[existingIndex];
          const next = { ...existing, ...update, createdAt: existing.createdAt };
          this.projects[existingIndex] = next;
          return next;
        }
        this.projects.push(create);
        return create;
      }
    };
    this.auditLog = {
      create: async ({ data }) => {
        const record = { ...data, occurredAt: data.occurredAt ?? new Date() };
        this.audits.push(record);
        return record;
      },
      findMany: async ({ where, orderBy }) => sortByOccurredAt(this.audits.filter((audit) => matchesAudit(audit, where)), orderBy?.occurredAt)
    };
  }
}

export function createCoreRepositories(client: CorePersistenceClient): CoreRepositories {
  return {
    users: new PlatformUserRepository(client),
    projects: new ProjectRepository(client),
    audits: new AuditLogRepository(client)
  };
}

export function createCoreRepositoryBackedService(client: CorePersistenceClient = new MemoryCorePersistenceClient()): CoreRepositoryBackedService {
  return new CoreRepositoryBackedService(createCoreRepositories(client));
}

export async function createPrismaCorePersistence(databaseUrl = process.env.DATABASE_URL): Promise<{ client: CorePersistenceClient; repositories: CoreRepositories; service: CoreRepositoryBackedService }> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as CorePersistenceClient;
  const repositories = createCoreRepositories(client);
  return {
    client,
    repositories,
    service: new CoreRepositoryBackedService(repositories)
  };
}

function mapPlatformUser(record: PlatformUserRecord): PlatformUser {
  const roleRecord = record.roles?.[0]?.role;
  const role = normalizeRole(roleRecord?.key);
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role,
    status: record.status,
    permissions: roleRecord?.permissions?.length ? roleRecord.permissions : getMockPermissions(role)
  };
}

function mapProject(record: ProjectRecord): PlatformProject {
  const slugId = slugToId(record.slug);
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    status: record.status,
    ownerUserId: record.ownerUserId,
    appType: record.appType ?? "Workflow App",
    businessProblem: record.businessProblem ?? "Capture the business problem before PRD generation.",
    targetDepartment: record.targetDepartment ?? "Business Team",
    intendedUsers: record.intendedUsers,
    dataSensitivity: normalizeSensitivity(record.dataSensitivity),
    appId: record.apps?.[0]?.id ?? `app_${slugId}`,
    activeFrontendCheckpointId: record.activeFrontendCheckpointId ?? undefined,
    createdAt: toIsoString(record.createdAt)
  };
}

function mapAudit(record: AuditLogRecord): AuditEvent {
  return {
    id: record.id,
    actorId: record.actorUserId,
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    severity: record.severity,
    occurredAt: toIsoString(record.occurredAt),
    metadata: toJsonRecord(record.metadata)
  };
}

function defaultUsers(): PlatformUserRecord[] {
  const roles: Record<PlatformRole, PlatformRoleRecord> = {
    admin: { id: "role_admin", key: "admin", name: "Platform Admin", permissions: getMockPermissions("admin") },
    creator: { id: "role_creator", key: "creator", name: "Creator", permissions: getMockPermissions("creator") },
    end_user: { id: "role_end_user", key: "end_user", name: "End User", permissions: getMockPermissions("end_user") }
  };

  return [
    { id: "usr_admin", email: "admin@company.com", name: "Admin User", status: "active", roles: [{ role: roles.admin }] },
    { id: "usr_creator", email: "creator@company.com", name: "Creator User", status: "active", roles: [{ role: roles.creator }] },
    { id: "usr_end_user", email: "user@company.com", name: "End User", status: "active", roles: [{ role: roles.end_user }] }
  ];
}

function normalizeRole(role: string | undefined): PlatformRole {
  if (role === "admin" || role === "creator" || role === "end_user") return role;
  return "end_user";
}

function normalizeSensitivity(value: string | null): PlatformProject["dataSensitivity"] {
  if (value === "public" || value === "internal" || value === "confidential" || value === "restricted") return value;
  return "internal";
}

function matchesUniqueUser(user: PlatformUserRecord, where: FindUniqueUserArgs["where"]): boolean {
  if (where.email) return user.email === where.email;
  if (where.id) return user.id === where.id;
  return false;
}

function matchesAudit(audit: AuditLogRecord, where: FindManyAuditArgs["where"]): boolean {
  if (!where) return true;
  if (where.actorUserId && audit.actorUserId !== where.actorUserId) return false;
  if (where.action && audit.action !== where.action) return false;
  if (where.severity && audit.severity !== where.severity) return false;
  if (where.resourceType && audit.resourceType !== where.resourceType) return false;
  if (where.resourceId && audit.resourceId !== where.resourceId) return false;
  if (where.occurredAt?.gte && new Date(audit.occurredAt) < where.occurredAt.gte) return false;
  if (where.occurredAt?.lte && new Date(audit.occurredAt) > where.occurredAt.lte) return false;
  if (where.metadata?.path?.length === 1 && String(toJsonRecord(audit.metadata)[where.metadata.path[0]]) !== where.metadata.equals) return false;
  return true;
}

function sortByCreatedAt(records: ProjectRecord[], direction: "asc" | "desc" = "asc"): ProjectRecord[] {
  return [...records].sort((left, right) => compareDate(left.createdAt, right.createdAt, direction));
}

function sortByOccurredAt(records: AuditLogRecord[], direction: "asc" | "desc" = "asc"): AuditLogRecord[] {
  return [...records].sort((left, right) => compareDate(left.occurredAt, right.occurredAt, direction));
}

function compareDate(left: Date | string, right: Date | string, direction: "asc" | "desc"): number {
  const diff = new Date(left).getTime() - new Date(right).getTime();
  return direction === "asc" ? diff : -diff;
}

function toJsonRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return {};
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function slugToId(slug: string): string {
  return slug.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
}
