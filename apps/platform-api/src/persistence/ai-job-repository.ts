import { assertDurableAiJobIdempotencyScope, type DurableAiJob, type DurableAiJobResult, type DurableAiJobStore, type CreateDurableAiJob } from "../ai-governance/durable-job-worker";

type DurableAiJobRecord = Omit<DurableAiJob, "actorId" | "availableAt" | "leaseExpiresAt" | "createdAt" | "updatedAt" | "result" | "failureReason"> & {
  actorUserId: string;
  availableAt: Date | string;
  leaseExpiresAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  result: DurableAiJobResult | null;
  failureReason: string | null;
};

export interface AiJobPersistenceClient {
  aiExecutionJob: {
    findUnique(args: { where: { id?: string; requestId?: string } }): Promise<DurableAiJobRecord | null>;
    create(args: { data: DurableAiJobRecord }): Promise<DurableAiJobRecord>;
    findFirst(args: { where: { status: "queued"; availableAt: { lte: Date } }; orderBy: { createdAt: "asc" } }): Promise<DurableAiJobRecord | null>;
    updateMany(args: { where: { id?: string; status?: string; leaseOwner?: string; leaseExpiresAt?: { lte: Date } }; data: Partial<DurableAiJobRecord> }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: Partial<DurableAiJobRecord> }): Promise<DurableAiJobRecord>;
  };
}

/** PostgreSQL-backed lease queue. The conditional update makes a claim safe across API restarts and competing workers. */
export class PrismaDurableAiJobStore implements DurableAiJobStore {
  constructor(private readonly client: AiJobPersistenceClient) {}

  async enqueue(job: CreateDurableAiJob): Promise<DurableAiJob> {
    const prior = await this.client.aiExecutionJob.findUnique({ where: { requestId: job.requestId } });
    if (prior) {
      assertDurableAiJobIdempotencyScope(mapJob(prior), job);
      return mapJob(prior);
    }
    const now = new Date();
    const record = await this.client.aiExecutionJob.create({
      data: {
        id: job.id,
        requestId: job.requestId,
        actorUserId: job.actorId,
        projectId: job.projectId,
        scenario: job.scenario,
        payloadCiphertext: job.payloadCiphertext,
        availableAt: job.availableAt,
        status: "queued",
        attempts: 0,
        leaseOwner: undefined,
        leaseExpiresAt: null,
        result: null,
        failureReason: null,
        createdAt: now,
        updatedAt: now
      }
    });
    return mapJob(record);
  }

  async get(id: string): Promise<DurableAiJob | undefined> {
    const row = await this.client.aiExecutionJob.findUnique({ where: { id } });
    return row ? mapJob(row) : undefined;
  }

  async reclaimExpiredLeases(now: Date): Promise<void> {
    await this.client.aiExecutionJob.updateMany({
      where: { status: "running", leaseExpiresAt: { lte: now } },
      data: { status: "queued", leaseOwner: undefined, leaseExpiresAt: null, availableAt: now, updatedAt: now }
    });
  }

  async claimNext(input: { workerId: string; now: Date; leaseExpiresAt: Date }): Promise<DurableAiJob | undefined> {
    const candidate = await this.client.aiExecutionJob.findFirst({
      where: { status: "queued", availableAt: { lte: input.now } },
      orderBy: { createdAt: "asc" }
    });
    if (!candidate) return undefined;
    const claimed = await this.client.aiExecutionJob.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: {
        status: "running",
        attempts: candidate.attempts + 1,
        leaseOwner: input.workerId,
        leaseExpiresAt: input.leaseExpiresAt,
        updatedAt: input.now
      }
    });
    if (!claimed.count) return undefined;
    const row = await this.client.aiExecutionJob.findUnique({ where: { id: candidate.id } });
    return row ? mapJob(row) : undefined;
  }

  async succeed(id: string, workerId: string, result: DurableAiJobResult, now: Date): Promise<DurableAiJob> {
    return this.finish(id, workerId, { status: "succeeded", result, failureReason: null }, now);
  }

  async renewLease(id: string, workerId: string, now: Date, leaseExpiresAt: Date): Promise<DurableAiJob> {
    const updated = await this.client.aiExecutionJob.updateMany({
      where: { id, status: "running", leaseOwner: workerId },
      data: { leaseExpiresAt, updatedAt: now }
    });
    if (!updated.count) throw new Error("AI job lease is not owned by this worker");
    const row = await this.client.aiExecutionJob.findUnique({ where: { id } });
    if (!row) throw new Error(`Unknown durable AI job: ${id}`);
    return mapJob(row);
  }

  async fail(id: string, workerId: string, failureReason: string, now: Date): Promise<DurableAiJob> {
    return this.finish(id, workerId, { status: "failed", result: null, failureReason }, now);
  }

  private async finish(id: string, workerId: string, data: Pick<DurableAiJobRecord, "status" | "result" | "failureReason">, now: Date): Promise<DurableAiJob> {
    const updated = await this.client.aiExecutionJob.updateMany({
      where: { id, status: "running", leaseOwner: workerId },
      data: { ...data, leaseOwner: undefined, leaseExpiresAt: null, updatedAt: now }
    });
    if (!updated.count) throw new Error("AI job lease is not owned by this worker");
    const row = await this.client.aiExecutionJob.findUnique({ where: { id } });
    if (!row) throw new Error(`Unknown durable AI job: ${id}`);
    return mapJob(row);
  }
}

function mapJob(record: DurableAiJobRecord): DurableAiJob {
  const { actorUserId, leaseExpiresAt, result, failureReason, availableAt, createdAt, updatedAt, ...job } = record;
  return {
    ...job,
    actorId: actorUserId,
    status: job.status as DurableAiJob["status"],
    scenario: job.scenario as DurableAiJob["scenario"],
    availableAt: new Date(availableAt),
    ...(leaseExpiresAt ? { leaseExpiresAt: new Date(leaseExpiresAt) } : {}),
    ...(result ? { result } : {}),
    ...(failureReason ? { failureReason } : {}),
    createdAt: new Date(createdAt),
    updatedAt: new Date(updatedAt)
  };
}
