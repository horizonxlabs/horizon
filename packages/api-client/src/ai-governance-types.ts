// AI-governance + guardrail DTOs (providers, api keys, scenario routing, quotas, guardrail rules/events,
// usage logs, durable AI jobs). Relocated here (and re-exported from index.ts) purely to keep index.ts
// within its large-file ceiling — shapes and public API are unchanged.

export type AiUsageLogDto = {
  id: string;
  projectId: string;
  taskId: string;
  actorId: string;
  scenario: string;
  providerId: string;
  model: string;
  prompt: string;
  tokensUsed: number;
  occurredAt: string;
  status?: "succeeded" | "blocked" | "fallback" | "failed";
};

export type GuardrailResultDto = {
  decision: "allow" | "warn" | "block";
  eventId: string;
  matchedRuleIds?: string[];
  reason?: string;
};

export type AiProviderTestCallInput = {
  scenario: string;
  prompt: string;
  dryRun?: boolean;
};

export type AiProviderTestCallResponse = {
  providerId: string;
  providerName: string;
  adapter: string;
  model: string;
  status: "succeeded" | "fallback";
  fallbackUsed: boolean;
  tokensUsed: number;
  latencyMs: number;
  usageLogId: string;
  outputExcerpt: string;
};

export type DurableAiJobDto = {
  id: string;
  requestId: string;
  scenario: AiScenarioDto;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  result?: { evidenceRequestId: string };
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateDurableAiJobInput = {
  prompt: string;
  scenario: AiScenarioDto;
  requestId?: string;
  requestedTokens?: number;
};
export type AiProviderAdapterDto = "openai" | "openrouter" | "lm_studio" | "anthropic" | "google" | "azure_openai" | "mock";
export type AiScenarioDto =
  | "prd_generation"
  | "requirement_analysis"
  | "frontend_coding"
  | "backend_coding"
  | "review"
  | "documentation";
export type AiUsageModeDto = "production" | "development" | "fallback";

export type AiProviderDto = {
  id: string;
  name: string;
  adapter: AiProviderAdapterDto;
  baseUrl?: string;
  models: string[];
  status: "active" | "disabled";
  createdAt?: string;
};

export type CreateAiProviderInput = {
  name: string;
  adapter: AiProviderAdapterDto;
  baseUrl: string;
  models: string[];
};

export type AiApiKeyDto = {
  id: string;
  providerId: string;
  name: string;
  usageMode: AiUsageModeDto;
  quotaTokens?: number;
  fallbackPriority?: number;
  fingerprint: string;
  maskedValue: string;
  status: "active" | "disabled";
  createdAt?: string;
  lastUsedAt?: string;
};

export type CreateAiApiKeyInput = {
  providerId: string;
  name: string;
  secret: string;
  usageMode: AiUsageModeDto;
  quotaTokens: number;
  fallbackPriority: number;
};

export type AiScenarioRouteDto = {
  scenario: AiScenarioDto;
  primary: {
    providerId: string;
    model: string;
  };
  fallback?: {
    providerId: string;
    model: string;
  };
};

export type ConfigureAiRouteInput = {
  scenario: AiScenarioDto;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string;
  fallbackModel?: string;
};

export type AiQuotaDto = {
  scope: "organization" | "creator" | "project" | "app";
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number;
  hardStop: boolean;
  usedToday: number;
};

export type GuardrailRuleDto = {
  id: string;
  name: string;
  type: "keyword" | "regex" | "policy_classifier";
  pattern: string;
  severity: "info" | "warning" | "high" | "critical";
  action: "allow" | "warn" | "block";
  scope: "organization" | "project" | "app";
  status: "active" | "disabled";
  updatedAt?: string;
};

export type CreateGuardrailRuleInput = Omit<GuardrailRuleDto, "id" | "status" | "updatedAt">;

export type ProviderModelCatalogDto = {
  models: Array<{ id: string; name: string; contextLength?: number }>;
};

export type GuardrailEventDto = {
  id: string;
  actorId?: string;
  prompt?: string;
  scenario: string;
  decision: "allow" | "warn" | "block";
  matchedRuleId?: string;
  matchedRuleName?: string;
  severity?: GuardrailRuleDto["severity"];
  occurredAt?: string;
};
