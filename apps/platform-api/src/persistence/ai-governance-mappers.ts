import type { AiApiKeyRecord, AiProviderRecord, AiQuotaRecord, AiScenarioRouteRecord } from "./ai-governance-repositories";
import type { AiApiKey, AiProvider, AiProviderAdapter, AiQuota, AiScenario, AiScenarioRoute } from "../platform-services";

type DateValue = Date | string;
type QuotaScope = AiQuota["scope"];

export function mapProvider(record: AiProviderRecord): AiProvider {
  return {
    id: record.id,
    name: record.name,
    adapter: record.adapter as AiProviderAdapter,
    baseUrl: record.baseUrl,
    models: [...record.models],
    status: record.status,
    createdAt: toIsoString(record.createdAt)
  };
}

export function mapApiKey(record: AiApiKeyRecord): AiApiKey {
  return {
    id: record.id,
    providerId: record.providerId,
    name: record.name,
    usageMode: record.usageMode,
    quotaTokens: record.quotaTokens,
    fallbackPriority: record.fallbackPriority,
    fingerprint: record.fingerprint,
    maskedValue: record.maskedValue,
    status: record.status,
    createdAt: toIsoString(record.createdAt),
    lastUsedAt: record.lastUsedAt ? toIsoString(record.lastUsedAt) : undefined
  };
}

export function mapRoute(record: AiScenarioRouteRecord): AiScenarioRoute {
  return {
    scenario: record.scenario as AiScenario,
    primary: {
      providerId: record.primaryProviderId,
      model: record.primaryModel
    },
    fallback: record.fallbackProviderId
      ? {
          providerId: record.fallbackProviderId,
          model: record.fallbackModel ?? record.primaryModel
        }
      : undefined
  };
}

export function mapQuota(record: AiQuotaRecord): AiQuota {
  return {
    scope: record.scope as QuotaScope,
    dailyLimit: record.dailyLimit,
    monthlyLimit: record.monthlyLimit,
    warningThreshold: record.warningThreshold,
    hardStop: record.hardStop,
    usedToday: record.usedToday
  };
}

function toIsoString(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
