import type {
  GovernanceScope,
  KnowledgeApproval,
  KnowledgeRetrievalLog,
  KnowledgeSource,
  KnowledgeVersion,
  SkillApproval,
  SkillAssignment,
  SkillDefinition,
  SkillVersion
} from "../platform-services";

// Prisma persistence for the admin knowledge/skill governance surface. The existing in-memory
// KnowledgeGovernanceService / SkillGovernanceService remain the single source of truth for the
// business logic (retrieval scoping, approval supersede, resolution priority); this module only
// mirrors their state to Postgres so it survives a restart. On boot the services are hydrated from
// `loadKnowledgeSkillSnapshot`; after each admin mutation the async route writes the full snapshot
// back via `KnowledgeSkillWriter`.
//
// FK-safety: the scope columns that reference Project/App (knowledge_sources.projectId/appId,
// skill_assignments.projectId/appId, knowledge_retrieval_logs.projectId/appId) are written as NULL
// and the authoritative scope is kept in scopeValue / scopeType+scopeId, because a governance scope
// may name a project that is not itself persisted. Owner/actor/creator/decider FKs are satisfied by
// the identity reconciliation in the Keycloak session issuer. Filtering happens in memory after
// hydration, so the nulled index columns are not needed for correctness.

export interface KnowledgeSnapshot {
  sources: KnowledgeSource[];
  versions: KnowledgeVersion[];
  approvals: KnowledgeApproval[];
  retrievalLogs: KnowledgeRetrievalLog[];
}

export interface SkillSnapshot {
  skills: SkillDefinition[];
  versions: SkillVersion[];
  approvals: SkillApproval[];
  assignments: SkillAssignment[];
}

export interface KnowledgeSkillSnapshot {
  knowledge: KnowledgeSnapshot;
  skill: SkillSnapshot;
}

type Json = Record<string, unknown>;
const iso = (value: Date | null | undefined): string | undefined => value?.toISOString();

function toSource(record: Record<string, unknown>): KnowledgeSource {
  const scope = (record.scopeValue ?? { visibility: record.scopeType }) as GovernanceScope;
  return {
    id: String(record.id),
    title: String(record.title),
    sourceType: record.sourceType as KnowledgeSource["sourceType"],
    ownerUserId: String(record.ownerUserId),
    scope,
    uploadStatus: record.uploadStatus as KnowledgeSource["uploadStatus"],
    indexStatus: record.indexStatus as KnowledgeSource["indexStatus"],
    status: record.status as KnowledgeSource["status"],
    tags: (record.tags as string[]) ?? [],
    createdAt: (record.createdAt as Date).toISOString(),
    updatedAt: (record.updatedAt as Date).toISOString()
  };
}

function toVersion(record: Record<string, unknown>): KnowledgeVersion {
  return {
    id: String(record.id),
    sourceId: String(record.sourceId),
    version: String(record.version),
    contentHash: String(record.contentHash),
    changelog: String(record.changelog),
    chunkCount: Number(record.chunkCount),
    excerpts: (record.excerpts as string[]) ?? [],
    approvalStatus: record.approvalStatus as KnowledgeVersion["approvalStatus"],
    lifecycleStatus: record.lifecycleStatus as KnowledgeVersion["lifecycleStatus"],
    isActive: Boolean(record.isActive),
    approvedByUserId: (record.approvedByUserId as string | null) ?? undefined,
    approvedAt: iso(record.approvedAt as Date | null),
    createdByUserId: String(record.createdByUserId),
    createdAt: (record.createdAt as Date).toISOString()
  };
}

function toKnowledgeApproval(record: Record<string, unknown>): KnowledgeApproval {
  return {
    id: String(record.id),
    sourceId: String(record.sourceId),
    versionId: String(record.versionId),
    decision: record.decision as KnowledgeApproval["decision"],
    note: String(record.note),
    decidedByUserId: String(record.decidedByUserId),
    decidedAt: (record.decidedAt as Date).toISOString()
  };
}

function toRetrievalLog(record: Record<string, unknown>): KnowledgeRetrievalLog {
  return {
    id: String(record.id),
    actorUserId: String(record.actorUserId),
    projectId: (record.projectId as string | null) ?? undefined,
    appId: (record.appId as string | null) ?? undefined,
    department: (record.department as string | null) ?? undefined,
    agentRole: record.agentRole as KnowledgeRetrievalLog["agentRole"],
    scenario: record.scenario as KnowledgeRetrievalLog["scenario"],
    matchedVersionIds: (record.matchedVersionIds as string[]) ?? [],
    deniedVersionIds: (record.deniedVersionIds as string[]) ?? [],
    retrievalContext: (record.retrievalContext as Json) ?? {},
    createdAt: (record.createdAt as Date).toISOString()
  };
}

function toSkill(record: Record<string, unknown>): SkillDefinition {
  return {
    id: String(record.id),
    key: String(record.key),
    name: String(record.name),
    description: String(record.description),
    ownerUserId: String(record.ownerUserId),
    status: record.status as SkillDefinition["status"],
    createdAt: (record.createdAt as Date).toISOString(),
    updatedAt: (record.updatedAt as Date).toISOString()
  };
}

function toSkillVersion(record: Record<string, unknown>): SkillVersion {
  return {
    id: String(record.id),
    skillId: String(record.skillId),
    version: String(record.version),
    instruction: String(record.instruction),
    inputSchema: (record.inputSchema as Json) ?? {},
    outputSchema: (record.outputSchema as Json) ?? {},
    requiredKnowledgeSourceIds: (record.requiredKnowledgeSourceIds as string[]) ?? [],
    allowedTools: (record.allowedTools as string[]) ?? [],
    contentHash: String(record.contentHash),
    approvalStatus: record.approvalStatus as SkillVersion["approvalStatus"],
    lifecycleStatus: record.lifecycleStatus as SkillVersion["lifecycleStatus"],
    isActive: Boolean(record.isActive),
    approvedByUserId: (record.approvedByUserId as string | null) ?? undefined,
    approvedAt: iso(record.approvedAt as Date | null),
    createdByUserId: String(record.createdByUserId),
    createdAt: (record.createdAt as Date).toISOString()
  };
}

function toSkillApproval(record: Record<string, unknown>): SkillApproval {
  return {
    id: String(record.id),
    skillId: String(record.skillId),
    versionId: String(record.versionId),
    decision: record.decision as SkillApproval["decision"],
    note: String(record.note),
    decidedByUserId: String(record.decidedByUserId),
    decidedAt: (record.decidedAt as Date).toISOString()
  };
}

function toAssignment(record: Record<string, unknown>): SkillAssignment {
  return {
    id: String(record.id),
    skillId: String(record.skillId),
    skillVersionId: String(record.skillVersionId),
    agentRole: record.agentRole as SkillAssignment["agentRole"],
    scenario: record.scenario as SkillAssignment["scenario"],
    scopeType: record.scopeType as SkillAssignment["scopeType"],
    scopeId: String(record.scopeId),
    priority: Number(record.priority),
    status: record.status as SkillAssignment["status"],
    createdAt: (record.createdAt as Date).toISOString()
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type PrismaLike = any;

async function makeClient(databaseUrl = process.env.DATABASE_URL): Promise<PrismaLike> {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);
}

/** Loads persisted knowledge/skill state into the in-memory services and returns the write-through
 * writer used to mirror later admin mutations back to Postgres. Called once at boot in prisma mode. */
export async function hydrateKnowledgeSkills(
  services: {
    knowledge: { hydrate(state: KnowledgeSnapshot): void };
    skills: { hydrate(state: SkillSnapshot): void };
  },
  databaseUrl = process.env.DATABASE_URL
): Promise<KnowledgeSkillWriter> {
  const snapshot = await loadKnowledgeSkillSnapshot(databaseUrl);
  services.knowledge.hydrate(snapshot.knowledge);
  services.skills.hydrate(snapshot.skill);
  return createKnowledgeSkillWriter(databaseUrl);
}

export async function loadKnowledgeSkillSnapshot(
  databaseUrl = process.env.DATABASE_URL
): Promise<KnowledgeSkillSnapshot> {
  const client = await makeClient(databaseUrl);
  try {
    const [sources, kVersions, kApprovals, logs, skills, sVersions, sApprovals, assignments] =
      await Promise.all([
        client.knowledgeSource.findMany({ orderBy: { createdAt: "asc" } }),
        client.knowledgeVersion.findMany({ orderBy: { createdAt: "asc" } }),
        client.knowledgeApproval.findMany({ orderBy: { decidedAt: "asc" } }),
        client.knowledgeRetrievalLog.findMany({ orderBy: { createdAt: "asc" } }),
        client.skillDefinition.findMany({ orderBy: { createdAt: "asc" } }),
        client.skillVersion.findMany({ orderBy: { createdAt: "asc" } }),
        client.skillApproval.findMany({ orderBy: { decidedAt: "asc" } }),
        client.skillAssignment.findMany({ orderBy: { createdAt: "asc" } })
      ]);
    return {
      knowledge: {
        sources: sources.map(toSource),
        versions: kVersions.map(toVersion),
        approvals: kApprovals.map(toKnowledgeApproval),
        retrievalLogs: logs.map(toRetrievalLog)
      },
      skill: {
        skills: skills.map(toSkill),
        versions: sVersions.map(toSkillVersion),
        approvals: sApprovals.map(toSkillApproval),
        assignments: assignments.map(toAssignment)
      }
    };
  } finally {
    await client.$disconnect();
  }
}

function sourceWrite(s: KnowledgeSource) {
  return {
    title: s.title,
    sourceType: s.sourceType,
    ownerUserId: s.ownerUserId,
    scopeType: s.scope.visibility,
    scopeValue: s.scope as unknown as Json,
    projectId: null,
    appId: null,
    department: s.scope.department ?? null,
    agentRole: null,
    scenarios: s.scope.scenarios ?? [],
    uploadStatus: s.uploadStatus,
    indexStatus: s.indexStatus,
    status: s.status,
    tags: s.tags
  };
}

function versionWrite(v: KnowledgeVersion) {
  return {
    sourceId: v.sourceId,
    version: v.version,
    contentHash: v.contentHash,
    changelog: v.changelog,
    chunkCount: v.chunkCount,
    excerpts: v.excerpts,
    approvalStatus: v.approvalStatus,
    lifecycleStatus: v.lifecycleStatus,
    isActive: v.isActive,
    approvedByUserId: v.approvedByUserId ?? null,
    approvedAt: v.approvedAt ? new Date(v.approvedAt) : null,
    createdByUserId: v.createdByUserId
  };
}

function skillVersionWrite(v: SkillVersion) {
  return {
    skillId: v.skillId,
    version: v.version,
    instruction: v.instruction,
    inputSchema: v.inputSchema as unknown as Json,
    outputSchema: v.outputSchema as unknown as Json,
    requiredKnowledgeSourceIds: v.requiredKnowledgeSourceIds,
    allowedTools: v.allowedTools,
    contentHash: v.contentHash,
    approvalStatus: v.approvalStatus,
    lifecycleStatus: v.lifecycleStatus,
    isActive: v.isActive,
    approvedByUserId: v.approvedByUserId ?? null,
    approvedAt: v.approvedAt ? new Date(v.approvedAt) : null,
    createdByUserId: v.createdByUserId
  };
}

export interface KnowledgeSkillWriter {
  persistKnowledge(snapshot: KnowledgeSnapshot): Promise<void>;
  persistSkill(snapshot: SkillSnapshot): Promise<void>;
  close(): Promise<void>;
}

export async function createKnowledgeSkillWriter(
  databaseUrl = process.env.DATABASE_URL
): Promise<KnowledgeSkillWriter> {
  const client = await makeClient(databaseUrl);
  const upsert = (model: PrismaLike, id: string, data: Json, extraCreate: Json = {}) =>
    model.upsert({ where: { id }, update: data, create: { id, ...data, ...extraCreate } });
  return {
    async persistKnowledge(snapshot) {
      for (const s of snapshot.sources)
        await upsert(client.knowledgeSource, s.id, sourceWrite(s), { createdAt: new Date(s.createdAt) });
      for (const v of snapshot.versions)
        await upsert(client.knowledgeVersion, v.id, versionWrite(v), { createdAt: new Date(v.createdAt) });
      for (const a of snapshot.approvals)
        await upsert(
          client.knowledgeApproval,
          a.id,
          { sourceId: a.sourceId, versionId: a.versionId, decision: a.decision, note: a.note, decidedByUserId: a.decidedByUserId },
          { decidedAt: new Date(a.decidedAt) }
        );
      for (const log of snapshot.retrievalLogs)
        await upsert(
          client.knowledgeRetrievalLog,
          log.id,
          {
            actorUserId: log.actorUserId,
            projectId: null,
            appId: null,
            department: log.department ?? null,
            scenario: log.scenario,
            agentRole: log.agentRole,
            matchedVersionIds: log.matchedVersionIds,
            deniedVersionIds: log.deniedVersionIds,
            retrievalContext: log.retrievalContext as unknown as Json
          },
          { createdAt: new Date(log.createdAt) }
        );
    },
    async persistSkill(snapshot) {
      for (const s of snapshot.skills)
        await upsert(
          client.skillDefinition,
          s.id,
          { key: s.key, name: s.name, description: s.description, ownerUserId: s.ownerUserId, status: s.status },
          { createdAt: new Date(s.createdAt) }
        );
      for (const v of snapshot.versions)
        await upsert(client.skillVersion, v.id, skillVersionWrite(v), { createdAt: new Date(v.createdAt) });
      for (const a of snapshot.approvals)
        await upsert(
          client.skillApproval,
          a.id,
          { skillId: a.skillId, versionId: a.versionId, decision: a.decision, note: a.note, decidedByUserId: a.decidedByUserId },
          { decidedAt: new Date(a.decidedAt) }
        );
      for (const a of snapshot.assignments)
        await upsert(
          client.skillAssignment,
          a.id,
          {
            skillId: a.skillId,
            skillVersionId: a.skillVersionId,
            agentRole: a.agentRole,
            scenario: a.scenario,
            scopeType: a.scopeType,
            scopeId: a.scopeId,
            projectId: null,
            appId: null,
            department: null,
            priority: a.priority,
            status: a.status
          },
          { createdAt: new Date(a.createdAt) }
        );
    },
    async close() {
      await client.$disconnect();
    }
  };
}
