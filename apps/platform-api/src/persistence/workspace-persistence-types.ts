import type {
  AiScenario,
  GuardrailDecision,
  GuardrailResult,
  PlatformProject,
  PreviewVersion,
  PrdVersion,
  WorkspaceStepStatus,
  WorkspaceTaskStatus
} from "../platform-services";

export type DateValue = Date | string;

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
    findMany(args: {
      where: { projectId: string };
      include?: { steps?: boolean };
      orderBy?: { createdAt?: "asc" | "desc" };
    }): Promise<WorkspaceTaskRecord[]>;
    create(args: CreateTaskArgs): Promise<WorkspaceTaskRecord>;
  };
  workspaceTaskStep: {
    create(args: CreateStepArgs): Promise<WorkspaceTaskStepRecord>;
  };
  previewVersion: {
    findMany(args: {
      where: { projectId: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }): Promise<PreviewVersionRecord[]>;
    create(args: CreatePreviewArgs): Promise<PreviewVersionRecord>;
  };
  aiUsageLog: {
    findMany(args: {
      where: { projectId: string };
      orderBy?: { occurredAt?: "asc" | "desc" };
    }): Promise<AiUsageLogRecord[]>;
    create(args: CreateUsageArgs): Promise<AiUsageLogRecord>;
  };
  workspaceCodeCheckpoint?: {
    findMany(args: {
      where: { projectId: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }): Promise<import("./workspace-preview-fallbacks").WorkspaceCodeCheckpointRecord[]>;
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
