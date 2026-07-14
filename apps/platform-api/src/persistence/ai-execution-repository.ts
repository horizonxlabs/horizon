import type { AiExecutionEvidence, AiExecutionStore, GovernedAiExecutionResult } from "../ai-governance/execution-service";

type DateValue = Date | string;

export type AiExecutionEvidenceRecord = {
  id: string;
  requestId: string;
  actorUserId: string;
  projectId: string | null;
  scenario: string;
  providerId: string;
  model: string;
  status: AiExecutionEvidence["status"];
  tokensUsed: number;
  latencyMs: number;
  fallbackUsed: boolean;
  failureReason: string | null;
  quotaScope: string;
  quotaTokensReserved: number;
  occurredAt: DateValue;
};

export interface AiExecutionPersistenceClient {
  aiExecutionEvidence: {
    findUnique(args: { where: { requestId: string } }): Promise<AiExecutionEvidenceRecord | null>;
    create(args: { data: AiExecutionEvidenceRecord }): Promise<AiExecutionEvidenceRecord>;
  };
}

export class PrismaAiExecutionStore implements AiExecutionStore {
  constructor(private readonly client: AiExecutionPersistenceClient) {}

  async findByRequestId(requestId: string): Promise<GovernedAiExecutionResult | undefined> {
    const record = await this.client.aiExecutionEvidence.findUnique({ where: { requestId } });
    return record ? mapRecord(record) : undefined;
  }

  async save(result: GovernedAiExecutionResult): Promise<GovernedAiExecutionResult> {
    const existing = await this.findByRequestId(result.evidence.requestId);
    if (existing) return existing;
    const evidence = result.evidence;
    const record = await this.client.aiExecutionEvidence.create({
      data: {
        id: evidence.id, requestId: evidence.requestId, actorUserId: evidence.actorId, projectId: evidence.projectId || null,
        scenario: evidence.scenario, providerId: evidence.providerId, model: evidence.model, status: evidence.status,
        tokensUsed: evidence.tokensUsed, latencyMs: evidence.latencyMs, fallbackUsed: evidence.fallbackUsed,
        failureReason: evidence.failureReason ?? null, quotaScope: evidence.quotaScope, quotaTokensReserved: evidence.quotaTokensReserved,
        occurredAt: new Date(evidence.occurredAt)
      }
    });
    return { ...result, evidence: mapEvidence(record) };
  }
}

function mapRecord(record: AiExecutionEvidenceRecord): GovernedAiExecutionResult {
  return { status: record.status, evidence: mapEvidence(record) };
}

function mapEvidence(record: AiExecutionEvidenceRecord): AiExecutionEvidence {
  return {
    id: record.id, requestId: record.requestId, actorId: record.actorUserId, projectId: record.projectId ?? "",
    scenario: record.scenario as AiExecutionEvidence["scenario"], providerId: record.providerId, model: record.model,
    status: record.status, tokensUsed: record.tokensUsed, latencyMs: record.latencyMs, fallbackUsed: record.fallbackUsed,
    quotaScope: record.quotaScope, quotaTokensReserved: record.quotaTokensReserved,
    ...(record.failureReason ? { failureReason: record.failureReason } : {}), occurredAt: new Date(record.occurredAt).toISOString()
  };
}
