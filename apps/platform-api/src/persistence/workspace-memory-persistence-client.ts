import type {
  AiUsageLogRecord,
  PreviewVersionRecord,
  WorkspacePersistenceClient,
  WorkspaceTaskRecord,
  WorkspaceTaskStepRecord
} from "./workspace-repositories";

type DateValue = Date | string;

type MemoryWorkspaceSeed = {
  tasks?: WorkspaceTaskRecord[];
  steps?: WorkspaceTaskStepRecord[];
  previews?: PreviewVersionRecord[];
  usage?: AiUsageLogRecord[];
};

export class MemoryWorkspacePersistenceClient implements WorkspacePersistenceClient {
  readonly workspaceTask: WorkspacePersistenceClient["workspaceTask"];
  readonly workspaceTaskStep: WorkspacePersistenceClient["workspaceTaskStep"];
  readonly previewVersion: WorkspacePersistenceClient["previewVersion"];
  readonly aiUsageLog: WorkspacePersistenceClient["aiUsageLog"];

  private readonly tasks: WorkspaceTaskRecord[];
  private readonly steps: WorkspaceTaskStepRecord[];
  private readonly previews: PreviewVersionRecord[];
  private readonly usage: AiUsageLogRecord[];

  constructor(seed: MemoryWorkspaceSeed = {}) {
    this.tasks = seed.tasks ?? [];
    this.steps = seed.steps ?? [];
    this.previews = seed.previews ?? [];
    this.usage = seed.usage ?? [];
    this.workspaceTask = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.tasks.filter((task) => task.projectId === where.projectId),
          "createdAt",
          orderBy?.createdAt
        ).map((task) => ({
          ...task,
          steps: this.steps
            .filter((step) => step.taskId === task.id)
            .sort((left, right) => left.order - right.order)
        })),
      create: async ({ data }) => {
        this.tasks.push(data);
        return data;
      }
    };
    this.workspaceTaskStep = {
      create: async ({ data }) => {
        this.steps.push(data);
        return data;
      }
    };
    this.previewVersion = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.previews.filter((preview) => preview.projectId === where.projectId),
          "createdAt",
          orderBy?.createdAt
        ),
      create: async ({ data }) => {
        this.previews.push(data);
        return data;
      }
    };
    this.aiUsageLog = {
      findMany: async ({ where, orderBy }) =>
        sortByDate(
          this.usage.filter((usage) => usage.projectId === where.projectId),
          "occurredAt",
          orderBy?.occurredAt
        ),
      create: async ({ data }) => {
        this.usage.push(data);
        return data;
      }
    };
  }
}

function sortByDate<T>(records: T[], key: keyof T, direction: "asc" | "desc" = "asc"): T[] {
  return [...records].sort((left, right) => {
    const diff =
      new Date(left[key] as DateValue).getTime() - new Date(right[key] as DateValue).getTime();
    return direction === "desc" ? -diff : diff;
  });
}
