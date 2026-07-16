import { createMemoryAiQuotaUsagePersistence, type AiQuotaUsagePersistence } from "./ai-quota-usage-store";
import type {
  AiApiKeyRecord,
  AiGovernancePersistenceClient,
  AiProviderRecord,
  AiQuotaRecord,
  AiScenarioRouteRecord,
  GuardrailEventRecord,
  GuardrailRuleRecord
} from "./ai-governance-repositories";

export class MemoryAiGovernancePersistenceClient implements AiGovernancePersistenceClient {
  readonly aiProvider: AiGovernancePersistenceClient["aiProvider"];
  readonly aiApiKey: AiGovernancePersistenceClient["aiApiKey"];
  readonly aiScenarioRoute: AiGovernancePersistenceClient["aiScenarioRoute"];
  readonly aiQuota: AiGovernancePersistenceClient["aiQuota"];
  readonly aiQuotaUsage: AiQuotaUsagePersistence;
  readonly guardrailRule: AiGovernancePersistenceClient["guardrailRule"];
  readonly guardrailEvent: AiGovernancePersistenceClient["guardrailEvent"];

  private readonly providers: AiProviderRecord[];
  private readonly apiKeys: AiApiKeyRecord[];
  private readonly routes: AiScenarioRouteRecord[];
  private readonly quotas: AiQuotaRecord[];
  private readonly rules: GuardrailRuleRecord[];
  private readonly events: GuardrailEventRecord[];

  constructor(seed: { providers?: AiProviderRecord[]; apiKeys?: AiApiKeyRecord[]; routes?: AiScenarioRouteRecord[]; quotas?: AiQuotaRecord[]; rules?: GuardrailRuleRecord[]; events?: GuardrailEventRecord[] } = {}) {
    this.providers = seed.providers ?? [];
    this.apiKeys = seed.apiKeys ?? [];
    this.routes = seed.routes ?? [];
    this.quotas = seed.quotas ?? [];
    this.rules = seed.rules ?? [];
    this.events = seed.events ?? [];

    this.aiProvider = {
      findMany: async ({ orderBy } = {}) => sortByDate(this.providers, "createdAt", orderBy?.createdAt),
      findUnique: async ({ where }) => this.providers.find((provider) => provider.id === where.id) ?? null,
      upsert: async ({ where, update, create }) => upsertById(this.providers, where.id, update, create),
      delete: async ({ where }) => {
        const index = this.providers.findIndex((provider) => provider.id === where.id);
        if (index >= 0) this.providers.splice(index, 1);
      }
    };
    this.aiApiKey = {
      findMany: async ({ orderBy } = {}) => sortByDate(this.apiKeys, "createdAt", orderBy?.createdAt),
      create: async ({ data }) => {
        const existingIndex = this.apiKeys.findIndex((key) => key.id === data.id);
        if (existingIndex >= 0) this.apiKeys.splice(existingIndex, 1, data);
        else this.apiKeys.push(data);
        return data;
      },
      update: async ({ where, data }) => {
        const index = this.apiKeys.findIndex((key) => key.id === where.id);
        if (index < 0) throw new Error(`Unknown AI API key: ${where.id}`);
        const next = { ...this.apiKeys[index], ...data };
        this.apiKeys[index] = next;
        return next;
      },
      delete: async ({ where }) => {
        const index = this.apiKeys.findIndex((key) => key.id === where.id);
        if (index >= 0) this.apiKeys.splice(index, 1);
      }
    };
    this.aiScenarioRoute = {
      findMany: async ({ orderBy } = {}) => sortByString(this.routes, "scenario", orderBy?.scenario),
      upsert: async ({ where, update, create }) => upsertByKey(this.routes, "scenario", where.scenario, update, create),
      deleteMany: async ({ where }) => {
        const matches = (route: AiScenarioRouteRecord) =>
          where.OR.some(
            (condition) =>
              (condition.primaryProviderId !== undefined && route.primaryProviderId === condition.primaryProviderId) ||
              (condition.fallbackProviderId !== undefined && route.fallbackProviderId === condition.fallbackProviderId)
          );
        for (let index = this.routes.length - 1; index >= 0; index -= 1) {
          if (matches(this.routes[index])) this.routes.splice(index, 1);
        }
      }
    };
    this.aiQuota = {
      findMany: async ({ orderBy } = {}) => sortByString(this.quotas, "scope", orderBy?.scope),
      upsert: async ({ where, update, create }) => upsertByKey(this.quotas, "scope", where.scope, update, create)
    };
    this.aiQuotaUsage = createMemoryAiQuotaUsagePersistence();
    this.guardrailRule = {
      findMany: async ({ orderBy } = {}) => sortByDate(this.rules, "updatedAt", orderBy?.updatedAt),
      upsert: async ({ where, update, create }) => upsertById(this.rules, where.id, update, create)
    };
    this.guardrailEvent = {
      findMany: async ({ orderBy } = {}) => sortByDate(this.events, "occurredAt", orderBy?.occurredAt),
      create: async ({ data }) => {
        this.events.push(data);
        return data;
      }
    };
  }
}

function upsertById<T extends { id: string }>(records: T[], id: string, update: Partial<T>, create: T): T {
  return upsertByKey(records, "id", id, update, create);
}

function upsertByKey<T, K extends keyof T>(records: T[], key: K, value: T[K], update: Partial<T>, create: T): T {
  const existingIndex = records.findIndex((record) => record[key] === value);
  if (existingIndex >= 0) {
    const next = { ...records[existingIndex], ...update };
    records[existingIndex] = next;
    return next;
  }
  records.push(create);
  return create;
}

function sortByDate<T>(records: T[], key: keyof T, direction: "asc" | "desc" = "asc"): T[] {
  return [...records].sort((left, right) => {
    const diff = new Date(left[key] as Date | string).getTime() - new Date(right[key] as Date | string).getTime();
    return direction === "desc" ? -diff : diff;
  });
}

function sortByString<T>(records: T[], key: keyof T, direction: "asc" | "desc" = "asc"): T[] {
  return [...records].sort((left, right) => {
    const diff = String(left[key]).localeCompare(String(right[key]));
    return direction === "desc" ? -diff : diff;
  });
}
