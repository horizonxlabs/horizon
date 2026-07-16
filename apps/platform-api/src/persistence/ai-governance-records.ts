import type { AiProvider, AiUsageMode, GuardrailDecision, GuardrailRule, GuardrailRuleType } from "../platform-services";

export type DateValue = Date | string;
export type ProviderStatus = AiProvider["status"];
export type GuardrailSeverity = GuardrailRule["severity"];
export type GuardrailScope = GuardrailRule["scope"];

export interface AiProviderRecord {
  id: string;
  name: string;
  adapter: string;
  baseUrl: string;
  models: string[];
  status: ProviderStatus;
  createdAt: DateValue;
}
export interface AiApiKeyRecord {
  id: string;
  providerId: string;
  name: string;
  usageMode: AiUsageMode;
  quotaTokens: number;
  fallbackPriority: number;
  fingerprint: string;
  maskedValue: string;
  secretCiphertext: string;
  keyVersion: number;
  encryptionProvider: string;
  status: "active" | "disabled";
  lastUsedAt?: DateValue | null;
  createdAt: DateValue;
}
export interface AiScenarioRouteRecord {
  id: string;
  scenario: string;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string | null;
  fallbackModel?: string | null;
  createdAt?: DateValue;
}

export interface AiQuotaRecord {
  id: string;
  scope: string;
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number;
  hardStop: boolean;
  usedToday: number;
  createdAt?: DateValue;
}

export interface GuardrailRuleRecord {
  id: string;
  name: string;
  type: GuardrailRuleType;
  pattern: string;
  severity: GuardrailSeverity;
  action: GuardrailDecision;
  scope: GuardrailScope;
  status: "active" | "disabled";
  updatedAt: DateValue;
  createdAt?: DateValue;
}

export interface GuardrailEventRecord {
  id: string;
  actorUserId: string;
  prompt: string;
  scenario: string;
  decision: GuardrailDecision;
  matchedRuleId?: string | null;
  matchedRuleName?: string | null;
  severity: GuardrailSeverity;
  occurredAt: DateValue;
}

export interface UpsertProviderArgs {
  where: { id: string };
  update: Partial<AiProviderRecord>;
  create: AiProviderRecord;
}

export interface CreateApiKeyArgs {
  data: AiApiKeyRecord;
}

export interface UpsertRouteArgs {
  where: { scenario: string };
  update: Partial<AiScenarioRouteRecord>;
  create: AiScenarioRouteRecord;
}

export interface UpsertQuotaArgs {
  where: { scope: string };
  update: Partial<AiQuotaRecord>;
  create: AiQuotaRecord;
}

export interface UpsertGuardrailRuleArgs {
  where: { id: string };
  update: Partial<GuardrailRuleRecord>;
  create: GuardrailRuleRecord;
}

export interface CreateGuardrailEventArgs {
  data: GuardrailEventRecord;
}
