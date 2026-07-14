import { randomUUID } from "node:crypto";

import type { AiScenario } from "../platform-services";
import type { AiJobPayloadCipher, DurableAiJobStore } from "./durable-job-worker";

const supportedScenarios = new Set<AiScenario>([
  "prd_generation",
  "requirement_analysis",
  "frontend_coding",
  "backend_coding",
  "review",
  "documentation"
]);

export async function enqueueDurableAiJob(input: {
  body?: Record<string, unknown>;
  projectId: string;
  actorId: string;
  store?: DurableAiJobStore;
  cipher?: AiJobPayloadCipher;
}): Promise<{ id: string; requestId: string; status: string }> {
  if (!input.store || !input.cipher) throw new Error("Durable AI jobs require EVCP_AI_JOB_ENCRYPTION_KEY");
  const prompt = String(input.body?.prompt ?? "").trim();
  if (!prompt) throw new Error("AI prompt is required");
  const scenario = String(input.body?.scenario ?? "frontend_coding") as AiScenario;
  if (!supportedScenarios.has(scenario)) throw new Error("Unsupported AI job scenario");
  const requestId = String(input.body?.requestId ?? `aijobreq_${randomUUID()}`);
  const job = await input.store.enqueue({
    id: `aijob_${randomUUID()}`,
    requestId,
    actorId: input.actorId,
    projectId: input.projectId,
    scenario,
    payloadCiphertext: input.cipher.encrypt({
      prompt,
      ...(input.body?.requestedTokens === undefined ? {} : { requestedTokens: Number(input.body.requestedTokens) })
    }),
    availableAt: new Date()
  });
  return { id: job.id, requestId: job.requestId, status: job.status };
}

export async function handleDurableAiJob(input: {
  method: "GET" | "POST";
  jobId?: string;
  body?: Record<string, unknown>;
  projectId: string;
  actorId: string;
  store?: DurableAiJobStore;
  cipher?: AiJobPayloadCipher;
}) {
  if (input.method === "POST") {
    return { status: 202, data: await enqueueDurableAiJob(input) };
  }
  const job = input.jobId ? await input.store?.get(input.jobId) : undefined;
  if (!job || job.projectId !== input.projectId) return { status: 404 as const };
  return {
    status: 200,
    data: {
      id: job.id, requestId: job.requestId, scenario: job.scenario, status: job.status,
      attempts: job.attempts, result: job.result, failureReason: job.failureReason,
      createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString()
    }
  };
}

export function registerDurableAiJobHttpRoutes(input: {
  routes: { post(path: string, handler: (request: any, response: any) => void): void; get(path: string, handler: (request: any, response: any) => void): void };
  execute: (request: any) => Promise<any>;
  respond: (response: any, operation: Promise<any>) => unknown;
}) {
  input.routes.post("/projects/:projectId/ai-jobs", (request, response) => input.respond(response, input.execute({ method: "POST", path: `/projects/${String(request.params?.projectId ?? "")}/ai-jobs`, headers: request.headers, body: request.body })));
  input.routes.get("/projects/:projectId/ai-jobs/:jobId", (request, response) => input.respond(response, input.execute({ method: "GET", path: `/projects/${String(request.params?.projectId ?? "")}/ai-jobs/${String(request.params?.jobId ?? "")}`, headers: request.headers })));
}
