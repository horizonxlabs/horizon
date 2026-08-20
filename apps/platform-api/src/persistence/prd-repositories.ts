import type { AiScenario, PlatformProject, PlatformUser, PrdSection, PrdVersion } from "../platform-services";
import { ConflictError, PermissionError, ValidationError } from "../platform-services";

type DateValue = Date | string;
type PrdStatus = "draft" | "baseline_confirmed";
type PrdVersionStatus = PrdVersion["status"];

interface GeneratedByRecord {
  scenario: AiScenario;
  providerId: string;
  model: string;
}

interface PrdDocumentRecord {
  id: string;
  projectId: string;
  status: PrdStatus | string;
  currentVersionId?: string | null;
  baselineVersionId?: string | null;
  versions?: PrdVersionRecord[];
  createdAt?: DateValue;
  updatedAt: DateValue;
}

interface PrdVersionRecord {
  id: string;
  documentId: string;
  version: string;
  status: PrdVersionStatus | string;
  isBaseline: boolean;
  sourcePrompt: string;
  changeSummary: string;
  generatedBy: unknown;
  createdByUserId: string;
  createdAt: DateValue;
  sections?: PrdSectionRecord[];
}

interface PrdSectionRecord {
  id: string;
  versionId: string;
  key: string;
  title: string;
  body: string;
  order: number;
}

interface FindUniqueDocumentArgs {
  where: { projectId: string };
  include?: { versions?: { include?: { sections?: boolean }; orderBy?: { createdAt?: "asc" | "desc" } } };
}

interface UpsertDocumentArgs {
  where: { projectId: string };
  update: Partial<PrdDocumentRecord>;
  create: PrdDocumentRecord;
}

interface UpdateDocumentArgs {
  where: { projectId: string };
  data: Partial<PrdDocumentRecord>;
}

interface CreateVersionArgs {
  data: PrdVersionRecord;
}

interface CreateSectionArgs {
  data: PrdSectionRecord;
}

export interface PrdPersistenceClient {
  prdDocument: {
    findUnique(args: FindUniqueDocumentArgs): Promise<PrdDocumentRecord | null>;
    upsert(args: UpsertDocumentArgs): Promise<PrdDocumentRecord>;
    update(args: UpdateDocumentArgs): Promise<PrdDocumentRecord>;
  };
  prdVersion: {
    create(args: CreateVersionArgs): Promise<PrdVersionRecord>;
  };
  prdSection: {
    create(args: CreateSectionArgs): Promise<PrdSectionRecord>;
  };
}

export interface GeneratePrdDraftInput {
  project: PlatformProject;
  sourcePrompt: string;
  generatedBy: GeneratedByRecord;
  aiSummary: string;
}

export class PrdRepositoryBackedService {
  constructor(private readonly client: PrdPersistenceClient) {}

  /** Bootstrap a deterministic baseline from a prompt-first project's own brief. */
  async ensureInitialBaseline(actor: PlatformUser, project: PlatformProject, input: { sourcePrompt: string }): Promise<PrdVersion> {
    requireProjectAccess(actor, project);
    const existing = await this.client.prdDocument.findUnique({
      where: { projectId: project.id },
      include: { versions: { include: { sections: true }, orderBy: { createdAt: "asc" } } }
    });
    const current = existing?.versions?.find((version) => version.id === existing.currentVersionId);
    if (current?.isBaseline) return mapVersion(current, project.id);
    if (current) {
      throw new ValidationError(`PRD draft must be confirmed before building project ${project.id}`);
    }

    const sourcePrompt = input.sourcePrompt.trim() || project.businessProblem;
    const draft = await this.generateDraft(actor, {
      project,
      sourcePrompt,
      generatedBy: {
        scenario: "prd_generation",
        providerId: "project-bootstrap",
        model: "deterministic-initial-baseline"
      },
      aiSummary: `Initial app brief: ${sourcePrompt}`
    });
    return this.confirmBaseline(actor, project, draft.id);
  }

  async generateDraft(actor: PlatformUser, input: GeneratePrdDraftInput): Promise<PrdVersion> {
    requireProjectAccess(actor, input.project);
    const now = new Date();
    const document = await this.ensureDocument(input.project.id, now);
    const draftNumber = document.versions?.filter((version) => version.status === "draft").length ?? 0;
    const draftId = `prdver_${input.project.id}_${String(draftNumber + 1).padStart(2, "0")}`;
    const version = await this.client.prdVersion.create({
      data: {
        id: draftId,
        documentId: document.id,
        version: "0.1",
        status: "draft",
        isBaseline: false,
        sourcePrompt: input.sourcePrompt,
        changeSummary: `Generated initial PRD draft for ${input.project.name}`,
        generatedBy: input.generatedBy,
        createdByUserId: actor.id,
        createdAt: now
      }
    });

    const sections = buildSections(input.project, input.aiSummary).map((section) => ({ ...section, id: `prdsec_${draftId}_${section.key}`, versionId: draftId }));
    for (const section of sections) {
      await this.client.prdSection.create({ data: section });
    }

    await this.client.prdDocument.update({
      where: { projectId: input.project.id },
      data: {
        status: "draft",
        currentVersionId: draftId,
        updatedAt: now
      }
    });

    return {
      ...mapVersion(version, input.project.id),
      sections: sections.map(mapSection)
    };
  }

  async confirmBaseline(actor: PlatformUser, project: PlatformProject, versionId: string): Promise<PrdVersion> {
    requireProjectAccess(actor, project);
    const document = await this.getDocument(project.id);
    if (document.baselineVersionId) throw new ConflictError(`PRD baseline already confirmed for project ${project.id}`);
    const draft = document.versions?.find((candidate) => candidate.id === versionId);
    if (!draft) throw new ValidationError(`Unknown PRD version: ${versionId}`);

    const now = new Date();
    const baselineId = `prdver_${project.id}_baseline_v1_0`;
    const baseline = await this.client.prdVersion.create({
      data: {
        id: baselineId,
        documentId: document.id,
        version: "1.0",
        status: "baseline",
        isBaseline: true,
        sourcePrompt: draft.sourcePrompt,
        changeSummary: `Baseline v1.0 confirmed for ${project.name}`,
        generatedBy: draft.generatedBy,
        createdByUserId: actor.id,
        createdAt: now
      }
    });

    const sections = (draft.sections ?? []).map((section) => ({
      ...section,
      id: `prdsec_${baselineId}_${section.key}`,
      versionId: baselineId
    }));
    for (const section of sections) {
      await this.client.prdSection.create({ data: section });
    }

    await this.client.prdDocument.update({
      where: { projectId: project.id },
      data: {
        status: "baseline_confirmed",
        currentVersionId: baselineId,
        baselineVersionId: baselineId,
        updatedAt: now
      }
    });

    return {
      ...mapVersion(baseline, project.id),
      sections: sections.map(mapSection)
    };
  }

  async getCurrent(actor: PlatformUser, project: PlatformProject): Promise<PrdVersion> {
    requireProjectAccess(actor, project);
    const document = await this.getDocument(project.id);
    const current = document.versions?.find((version) => version.id === document.currentVersionId);
    if (!current) throw new ValidationError(`No current PRD version for project ${project.id}`);
    return mapVersion(current, project.id);
  }

  async listVersions(actor: PlatformUser, project: PlatformProject): Promise<PrdVersion[]> {
    requireProjectAccess(actor, project);
    const document = await this.getDocument(project.id);
    return (document.versions ?? []).map((version) => mapVersion(version, project.id));
  }

  private async ensureDocument(projectId: string, now: Date): Promise<PrdDocumentRecord> {
    await this.client.prdDocument.upsert({
      where: { projectId },
      update: { updatedAt: now },
      create: {
        id: `prddoc_${projectId}`,
        projectId,
        status: "draft",
        currentVersionId: null,
        baselineVersionId: null,
        createdAt: now,
        updatedAt: now
      }
    });
    return this.getDocument(projectId);
  }

  private async getDocument(projectId: string): Promise<PrdDocumentRecord> {
    const document = await this.client.prdDocument.findUnique({
      where: { projectId },
      include: { versions: { include: { sections: true }, orderBy: { createdAt: "asc" } } }
    });
    if (!document) throw new ValidationError(`No PRD document for project ${projectId}`);
    return document;
  }
}

export class MemoryPrdPersistenceClient implements PrdPersistenceClient {
  readonly prdDocument: PrdPersistenceClient["prdDocument"];
  readonly prdVersion: PrdPersistenceClient["prdVersion"];
  readonly prdSection: PrdPersistenceClient["prdSection"];

  private readonly documents: PrdDocumentRecord[];
  private readonly versions: PrdVersionRecord[];
  private readonly sections: PrdSectionRecord[];

  constructor(seed: { documents?: PrdDocumentRecord[]; versions?: PrdVersionRecord[]; sections?: PrdSectionRecord[] } = {}) {
    this.documents = seed.documents ?? [];
    this.versions = seed.versions ?? [];
    this.sections = seed.sections ?? [];

    this.prdDocument = {
      findUnique: async ({ where }) => this.findDocument(where.projectId),
      upsert: async ({ where, update, create }) => {
        const existingIndex = this.documents.findIndex((document) => document.projectId === where.projectId);
        if (existingIndex >= 0) {
          const next = { ...this.documents[existingIndex], ...update };
          this.documents[existingIndex] = next;
          return next;
        }
        this.documents.push(create);
        return create;
      },
      update: async ({ where, data }) => {
        const existingIndex = this.documents.findIndex((document) => document.projectId === where.projectId);
        if (existingIndex < 0) throw new ValidationError(`No PRD document for project ${where.projectId}`);
        const next = { ...this.documents[existingIndex], ...data };
        this.documents[existingIndex] = next;
        return next;
      }
    };
    this.prdVersion = {
      create: async ({ data }) => {
        const existingIndex = this.versions.findIndex((version) => version.id === data.id);
        if (existingIndex >= 0) this.versions.splice(existingIndex, 1, data);
        else this.versions.push(data);
        return data;
      }
    };
    this.prdSection = {
      create: async ({ data }) => {
        const existingIndex = this.sections.findIndex((section) => section.id === data.id);
        if (existingIndex >= 0) this.sections.splice(existingIndex, 1, data);
        else this.sections.push(data);
        return data;
      }
    };
  }

  private findDocument(projectId: string): PrdDocumentRecord | null {
    const document = this.documents.find((candidate) => candidate.projectId === projectId);
    if (!document) return null;
    return {
      ...document,
      versions: this.versions
        .filter((version) => version.documentId === document.id)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        .map((version) => ({
          ...version,
          sections: this.sections.filter((section) => section.versionId === version.id).sort((left, right) => left.order - right.order)
        }))
    };
  }
}

export function createPrdRepositoryBackedService(client: PrdPersistenceClient = new MemoryPrdPersistenceClient()): PrdRepositoryBackedService {
  return new PrdRepositoryBackedService(client);
}

export async function createPrismaPrdPersistence(databaseUrl = process.env.DATABASE_URL): Promise<{ client: PrdPersistenceClient; service: PrdRepositoryBackedService }> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as PrdPersistenceClient;
  return {
    client,
    service: new PrdRepositoryBackedService(client)
  };
}

function requireProjectAccess(actor: PlatformUser, project: PlatformProject): void {
  if (!["admin", "creator"].includes(actor.role)) throw new PermissionError(`Role ${actor.role} cannot manage PRD versions`);
  if (actor.role !== "admin" && project.ownerUserId !== actor.id) throw new PermissionError(`Role ${actor.role} cannot access project ${project.id}`);
}

function mapVersion(record: PrdVersionRecord, projectId: string): PrdVersion {
  return {
    id: record.id,
    projectId,
    version: record.version,
    status: normalizeVersionStatus(record.status),
    isBaseline: record.isBaseline,
    sourcePrompt: record.sourcePrompt,
    changeSummary: record.changeSummary,
    generatedBy: normalizeGeneratedBy(record.generatedBy),
    sections: (record.sections ?? []).sort((left, right) => left.order - right.order).map(mapSection),
    createdByUserId: record.createdByUserId,
    createdAt: toIsoString(record.createdAt)
  };
}

function mapSection(record: PrdSectionRecord): PrdSection {
  return {
    id: record.id,
    key: record.key,
    title: record.title,
    body: record.body,
    order: record.order
  };
}

function normalizeVersionStatus(status: string): PrdVersionStatus {
  return status === "baseline" ? "baseline" : "draft";
}

function normalizeGeneratedBy(value: unknown): GeneratedByRecord {
  const record = typeof value === "object" && value ? value as Partial<GeneratedByRecord> : {};
  return {
    scenario: (record.scenario ?? "prd_generation") as AiScenario,
    providerId: record.providerId ?? "unknown_provider",
    model: record.model ?? "unknown_model"
  };
}

function buildSections(project: PlatformProject, aiSummary: string): Array<Omit<PrdSectionRecord, "id" | "versionId">> {
  return [
    ["overview", "Overview", `${project.name} is a ${project.appType} for ${project.targetDepartment}. AI Gateway Summary: ${aiSummary}`],
    ["business_objective", "Business Objective", project.businessProblem],
    ["users_roles", "Users and Roles", `Primary users are ${project.intendedUsers.join(", ")}.`],
    ["core_flows", "Core Flows", "Create request, review, approval, notification and reporting flows."],
    ["data_model", "Data Model", "Core entities, relationships, retention needs and audit metadata."],
    ["acceptance_criteria", "Acceptance Criteria", "Creator can generate, review and confirm PRD baseline before app generation."]
  ].map(([key, title, body], index) => ({
    key,
    title,
    body,
    order: index + 1
  }));
}

function toIsoString(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
