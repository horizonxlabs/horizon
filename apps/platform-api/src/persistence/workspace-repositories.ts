import type {
  AiScenario,
  GuardrailDecision,
  GuardrailResult,
  PlatformProject,
  PlatformUser,
  PreviewVersion,
  PrdVersion,
  WorkspacePromptResult,
  WorkspaceSnapshot,
  WorkspaceStepStatus,
  WorkspaceTask,
  WorkspaceTaskStatus
} from "../platform-services";
import { PermissionError, ValidationError } from "../platform-services";
import { MemoryWorkspacePersistenceClient } from "./workspace-memory-persistence-client";
export { MemoryWorkspacePersistenceClient } from "./workspace-memory-persistence-client";

type DateValue = Date | string;

export interface WorkspaceTaskRecord {
  id: string;
  projectId: string;
  prompt: string;
  status: WorkspaceTaskStatus | string;
  guardrailDecision: GuardrailDecision | string;
  guardrailEventId: string;
  knowledgeVersionIds?: string[];
  skillVersionId?: string | null;
  createdByUserId: string;
  createdAt: DateValue;
  steps?: WorkspaceTaskStepRecord[];
}

export interface WorkspaceTaskStepRecord {
  id: string;
  taskId: string;
  label: string;
  status: WorkspaceStepStatus | string;
  order: number;
}

export interface PreviewVersionRecord {
  id: string;
  projectId: string;
  version: string;
  summary: string;
  device: PreviewVersion["device"] | string;
  screenTitle: string;
  highlights: string[];
  createdAt: DateValue;
}

export interface AiUsageLogRecord {
  id: string;
  projectId: string;
  taskId: string;
  actorUserId: string;
  scenario: AiScenario | string;
  providerId: string;
  model: string;
  prompt: string;
  tokensUsed: number;
  knowledgeVersionIds?: string[];
  skillVersionId?: string | null;
  occurredAt: DateValue;
}

interface CreateTaskArgs {
  data: WorkspaceTaskRecord;
}

interface CreateStepArgs {
  data: WorkspaceTaskStepRecord;
}

interface CreatePreviewArgs {
  data: PreviewVersionRecord;
}

interface CreateUsageArgs {
  data: AiUsageLogRecord;
}

export interface WorkspacePersistenceClient {
  workspaceTask: {
    findMany(args: { where: { projectId: string }; include?: { steps?: boolean }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<WorkspaceTaskRecord[]>;
    create(args: CreateTaskArgs): Promise<WorkspaceTaskRecord>;
  };
  workspaceTaskStep: {
    create(args: CreateStepArgs): Promise<WorkspaceTaskStepRecord>;
  };
  previewVersion: {
    findMany(args: { where: { projectId: string }; orderBy?: { createdAt?: "asc" | "desc" } }): Promise<PreviewVersionRecord[]>;
    create(args: CreatePreviewArgs): Promise<PreviewVersionRecord>;
  };
  aiUsageLog: {
    findMany(args: { where: { projectId: string }; orderBy?: { occurredAt?: "asc" | "desc" } }): Promise<AiUsageLogRecord[]>;
    create(args: CreateUsageArgs): Promise<AiUsageLogRecord>;
  };
}

export interface SubmitWorkspacePromptInput {
  project: PlatformProject;
  baseline: PrdVersion;
  prompt: string;
  guardrail: GuardrailResult;
  route: { providerId: string; model: string };
  tokensUsed: number;
  knowledgeVersionIds?: string[];
  skillVersionId?: string;
}

export interface BlockWorkspacePromptInput {
  project: PlatformProject;
  baseline: PrdVersion;
  prompt: string;
  guardrail: GuardrailResult;
}

export class WorkspaceRepositoryBackedService {
  constructor(private readonly client: WorkspacePersistenceClient) {}

  async getWorkspace(actor: PlatformUser, input: { project: PlatformProject; baseline: PrdVersion }): Promise<WorkspaceSnapshot> {
    requireProjectAccess(actor, input.project);
    requireBaseline(input.baseline, input.project.id);
    const tasks = await this.listTasks(input.project.id);
    const usage = await this.listUsage(input.project.id);
    const usedToday = usage.reduce((total, item) => total + item.tokensUsed, 0);
    return {
      project: input.project,
      baseline: input.baseline,
      preview: await this.latestPreview(input.project.id),
      tasks,
      usage,
      tokenBudget: buildTokenBudget(usedToday)
    };
  }

  async submitPrompt(actor: PlatformUser, input: SubmitWorkspacePromptInput): Promise<WorkspacePromptResult> {
    requireProjectAccess(actor, input.project);
    requireBaseline(input.baseline, input.project.id);
    const prompt = input.prompt.trim();
    if (!prompt) throw new ValidationError("Prompt is required");
    const now = new Date();
    const task = await this.createTask(input.project.id, actor.id, prompt, "ready", input.guardrail, now, "done", {
      knowledgeVersionIds: input.knowledgeVersionIds,
      skillVersionId: input.skillVersionId
    });
    const preview = await this.createPreview(input.project.id, prompt, now);
    const usage = await this.client.aiUsageLog.create({
      data: {
        id: `ailog_${input.project.id}_${Date.now().toString(36)}`,
        projectId: input.project.id,
        taskId: task.id,
        actorUserId: actor.id,
        scenario: "frontend_coding",
        providerId: input.route.providerId,
        model: input.route.model,
        prompt,
        tokensUsed: input.tokensUsed,
        knowledgeVersionIds: input.knowledgeVersionIds ?? [],
        skillVersionId: input.skillVersionId ?? null,
        occurredAt: now
      }
    });
    return {
      guardrail: input.guardrail,
      task,
      preview,
      usage: mapUsage(usage),
      tokenBudget: buildTokenBudget(input.tokensUsed)
    };
  }

  async blockPrompt(actor: PlatformUser, input: BlockWorkspacePromptInput): Promise<WorkspacePromptResult> {
    requireProjectAccess(actor, input.project);
    requireBaseline(input.baseline, input.project.id);
    const prompt = input.prompt.trim();
    if (!prompt) throw new ValidationError("Prompt is required");
    const task = await this.createTask(input.project.id, actor.id, prompt, "blocked", input.guardrail, new Date(), "failed");
    return {
      guardrail: input.guardrail,
      task,
      preview: await this.latestPreview(input.project.id),
      tokenBudget: buildTokenBudget(0)
    };
  }

  async planPrompt(actor: PlatformUser, input: BlockWorkspacePromptInput): Promise<WorkspacePromptResult> {
    requireProjectAccess(actor, input.project);
    requireBaseline(input.baseline, input.project.id);
    const prompt = input.prompt.trim();
    if (!prompt) throw new ValidationError("Prompt is required");
    const task = await this.createTask(input.project.id, actor.id, prompt, "blocked", input.guardrail, new Date(), "done");
    return { guardrail: input.guardrail, task, preview: await this.latestPreview(input.project.id), tokenBudget: buildTokenBudget(0) };
  }

  async refreshPreview(actor: PlatformUser, input: { project: PlatformProject; baseline: PrdVersion }): Promise<PreviewVersion> {
    requireProjectAccess(actor, input.project);
    requireBaseline(input.baseline, input.project.id);
    return this.latestPreview(input.project.id);
  }

  private async listTasks(projectId: string): Promise<WorkspaceTask[]> {
    const records = await this.client.workspaceTask.findMany({ where: { projectId }, include: { steps: true }, orderBy: { createdAt: "asc" } });
    return records.map(mapTask);
  }

  private async listUsage(projectId: string) {
    const records = await this.client.aiUsageLog.findMany({ where: { projectId }, orderBy: { occurredAt: "asc" } });
    return records.map(mapUsage);
  }

  private async createTask(
    projectId: string,
    actorId: string,
    prompt: string,
    status: WorkspaceTaskStatus,
    guardrail: GuardrailResult,
    createdAt: Date,
    terminalStepStatus: WorkspaceStepStatus,
    context: { knowledgeVersionIds?: string[]; skillVersionId?: string } = {}
  ): Promise<WorkspaceTask> {
    const existing = await this.client.workspaceTask.findMany({ where: { projectId } });
    const id = `wst_${projectId}_${String(existing.length + 1).padStart(4, "0")}`;
    const record = await this.client.workspaceTask.create({
      data: {
        id,
        projectId,
        prompt,
        status,
        guardrailDecision: guardrail.decision,
        guardrailEventId: guardrail.eventId,
        knowledgeVersionIds: context.knowledgeVersionIds ?? [],
        skillVersionId: context.skillVersionId ?? null,
        createdByUserId: actorId,
        createdAt
      }
    });
    const steps = buildSteps(id, status, terminalStepStatus);
    for (const step of steps) await this.client.workspaceTaskStep.create({ data: step });
    return mapTask({ ...record, steps });
  }

  private async createPreview(projectId: string, prompt: string, createdAt: Date): Promise<PreviewVersion> {
    const existing = await this.client.previewVersion.findMany({ where: { projectId } });
    const number = existing.filter((preview) => preview.version !== "preview-0000").length + 1;
    const version = `preview-${String(number).padStart(4, "0")}`;
    const record = await this.client.previewVersion.create({
      data: {
        id: `preview_${projectId}_${String(number).padStart(4, "0")}`,
        projectId,
        version,
        summary: `Mock preview updated: ${prompt}`,
        device: "desktop",
        screenTitle: "Leave Management",
        highlights: ["WFH leave type", "Manager approval queue", "HR policy visibility"],
        createdAt
      }
    });
    return mapPreview(record);
  }

  private async latestPreview(projectId: string): Promise<PreviewVersion> {
    const previews = await this.client.previewVersion.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    const latest = previews.at(-1);
    if (latest) return mapPreview(latest);
    return {
      id: `preview_${projectId}_empty`,
      projectId,
      version: "preview-0000",
      summary: "No generated preview yet",
      device: "desktop",
      screenTitle: "Leave Management",
      highlights: ["Baseline PRD loaded", "Prompt required", "No generated changes"],
      createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString()
    };
  }
}

export function createWorkspaceRepositoryBackedService(client: WorkspacePersistenceClient = new MemoryWorkspacePersistenceClient()): WorkspaceRepositoryBackedService {
  return new WorkspaceRepositoryBackedService(client);
}

export async function createPrismaWorkspacePersistence(databaseUrl = process.env.DATABASE_URL): Promise<{ client: WorkspacePersistenceClient; service: WorkspaceRepositoryBackedService }> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as WorkspacePersistenceClient;
  return {
    client,
    service: new WorkspaceRepositoryBackedService(client)
  };
}

function requireProjectAccess(actor: PlatformUser, project: PlatformProject): void {
  if (!["admin", "creator"].includes(actor.role)) throw new PermissionError(`Role ${actor.role} cannot access workspace`);
  if (actor.role !== "admin" && project.ownerUserId !== actor.id) throw new PermissionError(`Role ${actor.role} cannot access project ${project.id}`);
}

function requireBaseline(baseline: PrdVersion, projectId: string): void {
  if (baseline.projectId !== projectId || !baseline.isBaseline) throw new ValidationError(`PRD baseline is required before opening workspace for project ${projectId}`);
}

function buildSteps(taskId: string, status: WorkspaceTaskStatus, terminalStepStatus: WorkspaceStepStatus): WorkspaceTaskStepRecord[] {
  const labels = ["Understanding request", "Loading PRD baseline", "Guardrail pre-check", "Selecting skill", "Generating frontend", "Applying auth/role rules", "Building preview", "Running checks", "Ready"];
  return labels.map((label, index) => ({
    id: `${taskId}_step_${index + 1}`,
    taskId,
    label,
    status: status === "blocked" && index >= 3 ? "pending" : terminalStepStatus,
    order: index + 1
  }));
}

function mapTask(record: WorkspaceTaskRecord): WorkspaceTask {
  return {
    id: record.id,
    projectId: record.projectId,
    prompt: record.prompt,
    status: normalizeTaskStatus(record.status),
    guardrailDecision: record.guardrailDecision as GuardrailDecision,
    guardrailEventId: record.guardrailEventId,
    knowledgeVersionIds: record.knowledgeVersionIds?.length ? record.knowledgeVersionIds : undefined,
    skillVersionId: record.skillVersionId ?? undefined,
    steps: (record.steps ?? []).sort((left, right) => left.order - right.order).map(mapStep),
    createdByUserId: record.createdByUserId,
    createdAt: toIsoString(record.createdAt)
  };
}

function mapStep(record: WorkspaceTaskStepRecord) {
  return {
    id: record.id,
    label: record.label,
    status: normalizeStepStatus(record.status),
    order: record.order
  };
}

function mapPreview(record: PreviewVersionRecord): PreviewVersion {
  return {
    id: record.id,
    projectId: record.projectId,
    version: record.version,
    summary: record.summary,
    device: normalizeDevice(record.device),
    screenTitle: record.screenTitle,
    highlights: [...record.highlights],
    createdAt: toIsoString(record.createdAt)
  };
}

function mapUsage(record: AiUsageLogRecord) {
  return {
    id: record.id,
    projectId: record.projectId,
    taskId: record.taskId,
    actorId: record.actorUserId,
    scenario: record.scenario as AiScenario,
    providerId: record.providerId,
    model: record.model,
    prompt: record.prompt,
    tokensUsed: record.tokensUsed,
    occurredAt: toIsoString(record.occurredAt)
  };
}

function normalizeTaskStatus(status: string): WorkspaceTaskStatus {
  if (status === "blocked" || status === "failed" || status === "running") return status;
  return "ready";
}

function normalizeStepStatus(status: string): WorkspaceStepStatus {
  if (status === "pending" || status === "running" || status === "warning" || status === "failed") return status;
  return "done";
}

function normalizeDevice(device: string): PreviewVersion["device"] {
  if (device === "tablet" || device === "mobile") return device;
  return "desktop";
}

function buildTokenBudget(tokensUsed: number): WorkspacePromptResult["tokenBudget"] {
  return {
    remainingToday: Math.max(1000 - tokensUsed, 0),
    remainingMonth: Math.max(5000 - tokensUsed, 0),
    requestEstimate: 120
  };
}

function toIsoString(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
