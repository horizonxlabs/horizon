import test from "node:test";
import assert from "node:assert/strict";

process.env.EVCP_ALLOW_SIMULATE_LOGIN = "1";

const {
  DurableAiJobWorker,
  MemoryDurableAiJobStore,
  createAiJobPayloadCipher
} = await import("../../apps/platform-api/src/ai-governance/durable-job-worker.ts");
const { PrismaDurableAiJobStore } = await import("../../apps/platform-api/src/persistence/ai-job-repository.ts");
const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");
const { executePlatformApiRequestAsync } = await import("../../apps/platform-api/src/app-factory.ts");

const encryptionKey = "c2FmZS10ZXN0LWtleS10aGF0LWlzLTMyLWJ5dGVzLWxvbmc=";

test("durable AI jobs persist encrypted payloads and can resume after a lease expires", async () => {
  const cipher = createAiJobPayloadCipher(encryptionKey);
  const store = new MemoryDurableAiJobStore();
  const queued = await store.enqueue({
    id: "aijob_001",
    requestId: "request_001",
    actorId: "usr_creator",
    projectId: "prj_001",
    scenario: "frontend_coding",
    payloadCiphertext: cipher.encrypt({ prompt: "Add an approval step", requestedTokens: 320 }),
    availableAt: new Date("2026-07-14T00:00:00.000Z")
  });

  assert.doesNotMatch(queued.payloadCiphertext, /approval step/);
  const firstWorker = new DurableAiJobWorker({ store, cipher, workerId: "worker-a", now: () => new Date("2026-07-14T00:00:00.000Z") });
  const leased = await firstWorker.claimNext();
  assert.equal(leased?.status, "running");

  const resumed = new DurableAiJobWorker({ store, cipher, workerId: "worker-b", now: () => new Date("2026-07-14T00:10:00.000Z") });
  const result = await resumed.runOnce(async (job) => {
    assert.deepEqual(job.payload, { prompt: "Add an approval step", requestedTokens: 320 });
    return { evidenceRequestId: job.requestId };
  });

  assert.equal(result?.status, "succeeded");
  assert.equal(result?.result?.evidenceRequestId, "request_001");
});

test("durable AI jobs fail closed when encrypted payload authentication fails", async () => {
  const cipher = createAiJobPayloadCipher(encryptionKey);
  const store = new MemoryDurableAiJobStore();
  const queued = await store.enqueue({
    id: "aijob_002",
    requestId: "request_002",
    actorId: "usr_creator",
    projectId: "prj_001",
    scenario: "frontend_coding",
    payloadCiphertext: cipher.encrypt({ prompt: "Never leak this prompt" }),
    availableAt: new Date("2026-07-14T00:00:00.000Z")
  });
  await store.replacePayload(queued.id, `${queued.payloadCiphertext}tampered`);

  const worker = new DurableAiJobWorker({ store, cipher, workerId: "worker-a", now: () => new Date("2026-07-14T00:00:00.000Z") });
  const result = await worker.runOnce(async () => ({ evidenceRequestId: "unexpected" }));

  assert.equal(result?.status, "failed");
  assert.equal(result?.failureReason, "payload_decryption_failed");
  assert.equal(result?.result, undefined);
});

test("durable AI idempotency keys cannot collide across actor or project scope", async () => {
  const store = new MemoryDurableAiJobStore();
  const base = {
    requestId: "shared-request-id",
    actorId: "usr_creator_a",
    projectId: "prj_a",
    scenario: "frontend_coding",
    payloadCiphertext: "encrypted",
    availableAt: new Date("2026-07-14T00:00:00.000Z")
  };
  await store.enqueue({ id: "aijob_scope_a", ...base });

  await assert.rejects(
    () => store.enqueue({ id: "aijob_scope_b", ...base, actorId: "usr_creator_b", projectId: "prj_b" }),
    /different scope/i
  );
});

test("durable worker renews a long-running lease so another worker cannot duplicate the job", async () => {
  const cipher = createAiJobPayloadCipher(encryptionKey);
  const store = new MemoryDurableAiJobStore();
  await store.enqueue({
    id: "aijob_heartbeat",
    requestId: "request_heartbeat",
    actorId: "usr_creator",
    projectId: "prj_001",
    scenario: "frontend_coding",
    payloadCiphertext: cipher.encrypt({ prompt: "Generate a long task" }),
    availableAt: new Date()
  });
  let finish;
  const worker = new DurableAiJobWorker({ store, cipher, workerId: "worker-a", leaseMs: 40 });
  const running = worker.runOnce(async () => await new Promise((resolve) => { finish = resolve; }));

  await new Promise((resolve) => setTimeout(resolve, 70));
  const competingWorker = new DurableAiJobWorker({ store, cipher, workerId: "worker-b", leaseMs: 40 });
  assert.equal(await competingWorker.claimNext(), undefined);

  finish({ evidenceRequestId: "request_heartbeat" });
  assert.equal((await running)?.status, "succeeded");
});

test("Prisma durable AI job store claims a queued job once and requeues an expired lease", async () => {
  const rows = new Map();
  const client = {
    aiExecutionJob: {
      async findUnique({ where }) { return rows.get(where.id) ?? [...rows.values()].find((row) => row.requestId === where.requestId) ?? null; },
      async create({ data }) {
        assert.equal(data.actorId, undefined);
        assert.equal(data.actorUserId, "usr_creator");
        rows.set(data.id, data);
        return data;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of rows.values()) {
          const matches = (!where.id || row.id === where.id) && (!where.status || row.status === where.status) && (!where.leaseOwner || row.leaseOwner === where.leaseOwner) && (!where.leaseExpiresAt?.lte || row.leaseExpiresAt <= where.leaseExpiresAt.lte);
          if (matches) { Object.assign(row, data); count += 1; }
        }
        return { count };
      },
      async findFirst({ where }) {
        return [...rows.values()].find((row) => row.status === where.status && row.availableAt <= where.availableAt.lte) ?? null;
      },
      async update({ where, data }) { const row = rows.get(where.id); Object.assign(row, data); return row; }
    }
  };
  const store = new PrismaDurableAiJobStore(client);
  await store.enqueue({ id: "aijob_003", requestId: "request_003", actorId: "usr_creator", projectId: "prj_001", scenario: "frontend_coding", payloadCiphertext: "encrypted", availableAt: new Date("2026-07-14T00:00:00.000Z") });
  await assert.rejects(
    () => store.enqueue({ id: "aijob_003_other", requestId: "request_003", actorId: "usr_other", projectId: "prj_other", scenario: "frontend_coding", payloadCiphertext: "encrypted-other", availableAt: new Date("2026-07-14T00:00:00.000Z") }),
    /different scope/i
  );
  const now = new Date("2026-07-14T00:00:00.000Z");
  const claimed = await store.claimNext({ workerId: "worker-a", now, leaseExpiresAt: new Date("2026-07-14T00:05:00.000Z") });
  assert.equal(claimed?.status, "running");
  assert.equal(claimed?.actorId, "usr_creator");
  assert.equal(await store.claimNext({ workerId: "worker-b", now, leaseExpiresAt: new Date("2026-07-14T00:05:00.000Z") }), undefined);
  await store.reclaimExpiredLeases(new Date("2026-07-14T00:06:00.000Z"));
  const reclaimed = await store.claimNext({ workerId: "worker-b", now: new Date("2026-07-14T00:06:00.000Z"), leaseExpiresAt: new Date("2026-07-14T00:11:00.000Z") });
  assert.equal(reclaimed?.leaseOwner, "worker-b");
});

test("AI job endpoint encrypts the prompt before durable enqueue", async () => {
  const services = createPlatformApiServices();
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const project = services.projects.createProject({ actor: creator, name: "Durable queue", slug: "durable-queue", appType: "Workflow App" });
  const store = new MemoryDurableAiJobStore();
  const cipher = createAiJobPayloadCipher(encryptionKey);
  const response = await executePlatformApiRequestAsync({ ...services, durableAiJobs: store, durableAiJobPayloadCipher: cipher }, {
    method: "POST",
    path: `/projects/${project.id}/ai-jobs`,
    headers: { "x-mock-user-email": "creator@company.com" },
    body: { prompt: "Add a restricted approval flow", scenario: "frontend_coding", requestId: "request_004" }
  });
  assert.equal(response.status, 202);
  const worker = new DurableAiJobWorker({ store, cipher, workerId: "worker-a" });
  const claimed = await worker.claimNext();
  assert.ok(claimed);
  assert.doesNotMatch(claimed.payloadCiphertext, /restricted approval/);

  const status = await executePlatformApiRequestAsync({ ...services, durableAiJobs: store, durableAiJobPayloadCipher: cipher }, {
    method: "GET",
    path: `/projects/${project.id}/ai-jobs/${claimed.id}`,
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.data.status, "running");
  assert.doesNotMatch(JSON.stringify(status.body), /restricted approval/);
  assert.doesNotMatch(JSON.stringify(status.body), /payloadCiphertext/);
});
