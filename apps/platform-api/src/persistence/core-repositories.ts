import { createHash, randomUUID } from "node:crypto";

import { getMockPermissions } from "@evcp/auth-sdk";
import type { PlatformRole } from "@evcp/types";
import type {
  AuditEvent,
  AuditFilterInput,
  CreateProjectInput,
  PlatformProject,
  PlatformUser
} from "../platform-services";
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
  passwordHash?: string | null;
  mustChangePassword?: boolean;
}

interface ProjectRecord {
  id: string;
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

interface CreateProjectArgs {
  data: ProjectRecord;
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

interface CredentialUserRecord {
  id: string;
  email: string;
  name: string;
  status: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
}

interface UpdateUserArgs {
  where: { id: string };
  data: {
    passwordHash?: string;
    mustChangePassword?: boolean;
    passwordUpdatedAt?: Date;
    name?: string;
    status?: string;
    roles?: { deleteMany: Record<string, never>; create: Array<{ role: { connect: { key: string } } }> };
  };
}

/**
 * Canonical Prisma nested-relation write for a user's role join, e.g.
 * `roles: { create: [{ role: { connect: { key: "creator" } } }] }`. This is the shape the REAL
 * `PrismaClient` requires and the shape `createUserWithRole` now emits for BOTH backends.
 */
interface NestedRolesCreate {
  create: Array<{ role: { connect: { key: string } } }>;
}

interface CreateUserArgs {
  data: {
    id: string;
    email: string;
    name: string;
    status?: string;
    roles?: PlatformUserRoleRecord[] | NestedRolesCreate;
  };
}

export interface CorePersistenceClient {
  platformUser: {
    findUnique(
      args: FindUniqueUserArgs
    ): Promise<(PlatformUserRecord & Partial<CredentialUserRecord>) | null>;
    update(args: UpdateUserArgs): Promise<{ id: string }>;
    create(
      args: CreateUserArgs
    ): Promise<{ id: string; email: string; name: string; status: string }>;
  };
  project: {
    findMany(args: FindManyProjectArgs): Promise<ProjectRecord[]>;
    create(args: CreateProjectArgs): Promise<ProjectRecord>;
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

    const id = `prj_${randomUUID().replaceAll("-", "")}`;
    const now = new Date();
    const data = {
      id,
      name: input.name,
      status: "draft" as const,
      ownerUserId: input.actor.id,
      appType: input.appType ?? "Workflow App",
      businessProblem:
        input.businessProblem ?? "Capture the business problem before PRD generation.",
      targetDepartment: input.targetDepartment ?? "Business Team",
      intendedUsers: input.intendedUsers ?? ["Business User"],
      dataSensitivity: input.dataSensitivity ?? "internal",
      activeFrontendCheckpointId: null,
      createdAt: now
    };

    const record = await this.client.project.create({
      data,
      include: { apps: true }
    });

    return mapProject(record);
  }
}

export class AuditLogRepository {
  constructor(private readonly client: CorePersistenceClient) {}

  async record(
    input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> &
      Partial<Pick<AuditEvent, "severity" | "metadata">>
  ): Promise<AuditEvent> {
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
        occurredAt:
          input.dateFrom || input.dateTo
            ? {
                gte: input.dateFrom ? new Date(input.dateFrom) : undefined,
                lte: input.dateTo ? new Date(input.dateTo) : undefined
              }
            : undefined
      },
      orderBy: { occurredAt: "asc" }
    });
    return records.map(mapAudit).filter((event) => {
      if (
        input.projectId &&
        event.resourceId !== input.projectId &&
        event.metadata.projectId !== input.projectId
      )
        return false;
      if (input.appId && event.resourceId !== input.appId && event.metadata.appId !== input.appId)
        return false;
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

  recordAudit(
    input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> &
      Partial<Pick<AuditEvent, "severity" | "metadata">>
  ): Promise<AuditEvent> {
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

  constructor(
    seed: {
      users?: PlatformUserRecord[];
      projects?: ProjectRecord[];
      audits?: AuditLogRecord[];
    } = {}
  ) {
    this.users = seed.users ?? defaultUsers();
    this.projects = seed.projects ?? [];
    this.audits = seed.audits ?? [];

    this.platformUser = {
      findUnique: async ({ where }) => {
        const user = this.users.find((candidate) => matchesUniqueUser(candidate, where));
        if (!user) return null;
        return {
          ...user,
          passwordHash: user.passwordHash ?? null,
          mustChangePassword: user.mustChangePassword ?? false
        };
      },
      update: async ({ where, data }) => {
        const user = this.users.find((candidate) => candidate.id === where.id);
        if (!user) throw new ValidationError(`Unknown platform user: ${where.id}`);
        if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash;
        if (data.mustChangePassword !== undefined)
          user.mustChangePassword = data.mustChangePassword;
        if (data.name !== undefined) user.name = data.name;
        if (data.status !== undefined) user.status = data.status as UserStatus;
        if (data.roles) user.roles = normalizeCreateRoles({ create: data.roles.create });
        return { id: user.id };
      },
      create: async ({ data }) => {
        const status = (data.status ?? "active") as UserStatus;
        const created: PlatformUserRecord = {
          id: data.id,
          email: data.email,
          name: data.name,
          status,
          passwordHash: null,
          mustChangePassword: false,
          roles: normalizeCreateRoles(data.roles)
        };
        this.users.push(created);
        return { id: created.id, email: created.email, name: created.name, status: created.status };
      }
    };
    this.project = {
      findMany: async ({ where, orderBy }) =>
        sortByCreatedAt(
          this.projects.filter((project) => {
            if (!where?.ownerUserId) return true;
            return project.ownerUserId === where.ownerUserId;
          }),
          orderBy?.createdAt
        ),
      create: async ({ data }) => {
        this.projects.push(data);
        return data;
      }
    };
    this.auditLog = {
      create: async ({ data }) => {
        const record = { ...data, occurredAt: data.occurredAt ?? new Date() };
        this.audits.push(record);
        return record;
      },
      findMany: async ({ where, orderBy }) =>
        sortByOccurredAt(
          this.audits.filter((audit) => matchesAudit(audit, where)),
          orderBy?.occurredAt
        )
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

export function createCoreRepositoryBackedService(
  client: CorePersistenceClient = new MemoryCorePersistenceClient()
): CoreRepositoryBackedService {
  return new CoreRepositoryBackedService(createCoreRepositories(client));
}

export async function createPrismaCorePersistence(databaseUrl = process.env.DATABASE_URL): Promise<{
  client: CorePersistenceClient;
  repositories: CoreRepositories;
  service: CoreRepositoryBackedService;
}> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined
  ) as unknown as CorePersistenceClient;
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
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    ownerUserId: record.ownerUserId,
    appType: record.appType ?? "Workflow App",
    businessProblem:
      record.businessProblem ?? "Capture the business problem before PRD generation.",
    targetDepartment: record.targetDepartment ?? "Business Team",
    intendedUsers: record.intendedUsers,
    dataSensitivity: normalizeSensitivity(record.dataSensitivity),
    appId: record.apps?.[0]?.id ?? `app_${slugToId(record.id)}`,
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
    admin: {
      id: "role_admin",
      key: "admin",
      name: "Platform Admin",
      permissions: getMockPermissions("admin")
    },
    creator: {
      id: "role_creator",
      key: "creator",
      name: "Creator",
      permissions: getMockPermissions("creator")
    },
    end_user: {
      id: "role_end_user",
      key: "end_user",
      name: "End User",
      permissions: getMockPermissions("end_user")
    }
  };

  return [
    {
      id: "usr_admin",
      email: "admin@company.com",
      name: "Admin User",
      status: "active",
      roles: [{ role: roles.admin }]
    },
    {
      id: "usr_creator",
      email: "creator@company.com",
      name: "Creator User",
      status: "active",
      roles: [{ role: roles.creator }]
    },
    {
      id: "usr_end_user",
      email: "user@company.com",
      name: "End User",
      status: "active",
      roles: [{ role: roles.end_user }]
    }
  ];
}

function normalizeRole(role: string | undefined): PlatformRole {
  if (role === "admin" || role === "creator" || role === "end_user") return role;
  return "end_user";
}

const ROLE_RECORD_IDS: Record<PlatformRole, string> = {
  admin: "role_admin",
  creator: "role_creator",
  end_user: "role_end_user"
};

const ROLE_RECORD_NAMES: Record<PlatformRole, string> = {
  admin: "Platform Admin",
  creator: "Creator",
  end_user: "End User"
};

/**
 * Builds the role-join record (`{ role: PlatformRoleRecord }`) for a given role key, mirroring
 * the seed pattern in `defaultUsers()`. Used to persist a newly created platform user's role
 * onto the `roles` join array on `PlatformUserRecord`, since role is not a scalar column.
 */
/**
 * Translates the `data.roles` passed to `platformUser.create` into the memory client's internal
 * `PlatformUserRoleRecord[]` join representation. Accepts BOTH the canonical Prisma nested write
 * (`{ create: [{ role: { connect: { key } } }] }`, now emitted by `createUserWithRole`) and, for
 * backward-compat, a bare `PlatformUserRoleRecord[]`. Nested `connect` keys are resolved to full
 * role records via `buildPlatformUserRoleRecords` (the same seed map used for default users).
 */
function normalizeCreateRoles(
  roles: CreateUserArgs["data"]["roles"]
): PlatformUserRoleRecord[] | undefined {
  if (!roles) return undefined;
  if (Array.isArray(roles)) return roles;
  return roles.create.map((entry) => buildPlatformUserRoleRecords(entry.role.connect.key)[0]);
}

export function buildPlatformUserRoleRecords(role: string | undefined): PlatformUserRoleRecord[] {
  const normalized = normalizeRole(role);
  return [
    {
      role: {
        id: ROLE_RECORD_IDS[normalized],
        key: normalized,
        name: ROLE_RECORD_NAMES[normalized],
        permissions: getMockPermissions(normalized)
      }
    }
  ];
}

/** Maintains the local projection used by persistence-backed routes from Keycloak's current claims. */
export async function upsertKeycloakUserProjection(
  client: CorePersistenceClient,
  input: { subject: string; email: string; name: string; role: PlatformRole }
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email;
  const roles = { deleteMany: {} as Record<string, never>, create: [{ role: { connect: { key: input.role } } }] };
  const existing = await client.platformUser.findUnique({ where: { email } });
  if (existing) {
    await client.platformUser.update({ where: { id: existing.id }, data: { name, status: "active", roles } });
    return;
  }
  await client.platformUser.create({
    data: {
      id: `usr_sso_${createHash("sha256").update(input.subject).digest("hex").slice(0, 12)}`,
      email,
      name,
      status: "active",
      roles: { create: roles.create }
    }
  });
}

function normalizeSensitivity(value: string | null): PlatformProject["dataSensitivity"] {
  if (
    value === "public" ||
    value === "internal" ||
    value === "confidential" ||
    value === "restricted"
  )
    return value;
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
  if (
    where.metadata?.path?.length === 1 &&
    String(toJsonRecord(audit.metadata)[where.metadata.path[0]]) !== where.metadata.equals
  )
    return false;
  return true;
}

function sortByCreatedAt(
  records: ProjectRecord[],
  direction: "asc" | "desc" = "asc"
): ProjectRecord[] {
  return [...records].sort((left, right) =>
    compareDate(left.createdAt, right.createdAt, direction)
  );
}

function sortByOccurredAt(
  records: AuditLogRecord[],
  direction: "asc" | "desc" = "asc"
): AuditLogRecord[] {
  return [...records].sort((left, right) =>
    compareDate(left.occurredAt, right.occurredAt, direction)
  );
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
  return slug
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
