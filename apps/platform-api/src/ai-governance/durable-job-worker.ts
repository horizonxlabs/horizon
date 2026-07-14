import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { AiScenario } from "../platform-services";

export type DurableAiJobStatus = "queued" | "running" | "succeeded" | "failed";

export type DurableAiJobPayload = { prompt: string; requestedTokens?: number };
export type DurableAiJobResult = { evidenceRequestId: string };

export type DurableAiJob = {
  id: string;
  requestId: string;
  actorId: string;
  projectId: string;
  scenario: AiScenario;
  payloadCiphertext: string;
  status: DurableAiJobStatus;
  attempts: number;
  availableAt: Date;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  result?: DurableAiJobResult;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDurableAiJob = Pick<
  DurableAiJob,
  "id" | "requestId" | "actorId" | "projectId" | "scenario" | "payloadCiphertext" | "availableAt"
>;

export function assertDurableAiJobIdempotencyScope(
  existing: Pick<DurableAiJob, "actorId" | "projectId" | "scenario">,
  candidate: Pick<CreateDurableAiJob, "actorId" | "projectId" | "scenario">
): void {
  if (
    existing.actorId !== candidate.actorId ||
    existing.projectId !== candidate.projectId ||
    existing.scenario !== candidate.scenario
  ) {
    throw new Error("AI job requestId already belongs to a different scope");
  }
}

export interface DurableAiJobStore {
  enqueue(job: CreateDurableAiJob): Promise<DurableAiJob>;
  get(id: string): Promise<DurableAiJob | undefined>;
  reclaimExpiredLeases(now: Date): Promise<void>;
  claimNext(input: { workerId: string; now: Date; leaseExpiresAt: Date }): Promise<DurableAiJob | undefined>;
  renewLease(id: string, workerId: string, now: Date, leaseExpiresAt: Date): Promise<DurableAiJob>;
  succeed(id: string, workerId: string, result: DurableAiJobResult, now: Date): Promise<DurableAiJob>;
  fail(id: string, workerId: string, failureReason: string, now: Date): Promise<DurableAiJob>;
}

export type AiJobPayloadCipher = {
  encrypt(payload: DurableAiJobPayload): string;
  decrypt(ciphertext: string): DurableAiJobPayload;
};

/**
 * Encrypts only the queued work payload; provider secrets remain in the provider secret store.
 * The supplied key must be injected by the deployment's KMS/secret-store integration, never
 * checked into source control or persisted in the job table.
 */
export function createAiJobPayloadCipher(keyMaterial: string): AiJobPayloadCipher {
  if (!keyMaterial.trim()) throw new Error("AI job payload encryption key is required");
  const key = createHash("sha256").update(keyMaterial).digest();
  return {
    encrypt(payload) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return `v1.${nonce.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
    },
    decrypt(ciphertext) {
      try {
        const [version, nonceText, tagText, encryptedText, extra] = ciphertext.split(".");
        if (version !== "v1" || !nonceText || !tagText || !encryptedText || extra) throw new Error("unsupported encrypted payload");
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonceText, "base64url"));
        decipher.setAuthTag(Buffer.from(tagText, "base64url"));
        const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]);
        const parsed = JSON.parse(plaintext.toString("utf8")) as DurableAiJobPayload;
        if (!parsed || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) throw new Error("invalid job payload");
        return parsed;
      } catch {
        throw new Error("payload_decryption_failed");
      }
    }
  };
}

export class MemoryDurableAiJobStore implements DurableAiJobStore {
  private readonly jobs = new Map<string, DurableAiJob>();

  async enqueue(job: CreateDurableAiJob): Promise<DurableAiJob> {
    const existing = [...this.jobs.values()].find((candidate) => candidate.requestId === job.requestId);
    if (existing) {
      assertDurableAiJobIdempotencyScope(existing, job);
      return clone(existing);
    }
    const now = new Date();
    const queued: DurableAiJob = { ...job, status: "queued", attempts: 0, createdAt: now, updatedAt: now };
    this.jobs.set(queued.id, queued);
    return clone(queued);
  }

  async get(id: string): Promise<DurableAiJob | undefined> {
    const job = this.jobs.get(id);
    return job ? clone(job) : undefined;
  }

  async reclaimExpiredLeases(now: Date): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.status === "running" && job.leaseExpiresAt && job.leaseExpiresAt <= now) {
        job.status = "queued";
        job.leaseOwner = undefined;
        job.leaseExpiresAt = undefined;
        job.availableAt = now;
        job.updatedAt = now;
      }
    }
  }

  async claimNext(input: { workerId: string; now: Date; leaseExpiresAt: Date }): Promise<DurableAiJob | undefined> {
    const candidate = [...this.jobs.values()]
      .filter((job) => job.status === "queued" && job.availableAt <= input.now)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];
    if (!candidate) return undefined;
    candidate.status = "running";
    candidate.attempts += 1;
    candidate.leaseOwner = input.workerId;
    candidate.leaseExpiresAt = input.leaseExpiresAt;
    candidate.updatedAt = input.now;
    return clone(candidate);
  }

  async succeed(id: string, workerId: string, result: DurableAiJobResult, now: Date): Promise<DurableAiJob> {
    const job = this.requireLease(id, workerId);
    job.status = "succeeded";
    job.result = result;
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.updatedAt = now;
    return clone(job);
  }

  async renewLease(id: string, workerId: string, now: Date, leaseExpiresAt: Date): Promise<DurableAiJob> {
    const job = this.requireLease(id, workerId);
    job.leaseExpiresAt = leaseExpiresAt;
    job.updatedAt = now;
    return clone(job);
  }

  async fail(id: string, workerId: string, failureReason: string, now: Date): Promise<DurableAiJob> {
    const job = this.requireLease(id, workerId);
    job.status = "failed";
    job.failureReason = failureReason;
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.updatedAt = now;
    return clone(job);
  }

  async replacePayload(id: string, payloadCiphertext: string): Promise<void> {
    this.require(id).payloadCiphertext = payloadCiphertext;
  }

  private require(id: string): DurableAiJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Unknown durable AI job: ${id}`);
    return job;
  }

  private requireLease(id: string, workerId: string): DurableAiJob {
    const job = this.require(id);
    if (job.status !== "running" || job.leaseOwner !== workerId) throw new Error("AI job lease is not owned by this worker");
    return job;
  }
}

export class DurableAiJobWorker {
  constructor(
    private readonly dependencies: {
      store: DurableAiJobStore;
      cipher: AiJobPayloadCipher;
      workerId: string;
      now?: () => Date;
      leaseMs?: number;
    }
  ) {}

  async claimNext(): Promise<DurableAiJob | undefined> {
    const now = this.now();
    await this.dependencies.store.reclaimExpiredLeases(now);
    return this.dependencies.store.claimNext({
      workerId: this.dependencies.workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + (this.dependencies.leaseMs ?? 5 * 60_000))
    });
  }

  async runOnce(execute: (job: DurableAiJob & { payload: DurableAiJobPayload }) => Promise<DurableAiJobResult>): Promise<DurableAiJob | undefined> {
    const job = await this.claimNext();
    if (!job) return undefined;
    const leaseMs = this.dependencies.leaseMs ?? 5 * 60_000;
    const heartbeat = setInterval(() => {
      const now = this.now();
      void this.dependencies.store.renewLease(job.id, this.dependencies.workerId, now, new Date(now.getTime() + leaseMs)).catch(() => undefined);
    }, Math.max(50, Math.floor(leaseMs / 2)));
    heartbeat.unref();
    try {
      const payload = this.dependencies.cipher.decrypt(job.payloadCiphertext);
      const result = await execute({ ...job, payload });
      return this.dependencies.store.succeed(job.id, this.dependencies.workerId, result, this.now());
    } catch (error) {
      const failureReason = error instanceof Error && error.message === "payload_decryption_failed"
        ? "payload_decryption_failed"
        : "execution_failed";
      return this.dependencies.store.fail(job.id, this.dependencies.workerId, failureReason, this.now());
    } finally {
      clearInterval(heartbeat);
    }
  }

  private now(): Date {
    return this.dependencies.now?.() ?? new Date();
  }
}

function clone(job: DurableAiJob): DurableAiJob {
  return { ...job, availableAt: new Date(job.availableAt), ...(job.leaseExpiresAt ? { leaseExpiresAt: new Date(job.leaseExpiresAt) } : {}) };
}
