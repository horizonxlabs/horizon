import { createHash } from "node:crypto";
import { createMemoryAiQuotaUsagePersistence, type AiQuotaUsagePersistence } from "./ai-quota-usage-store";
import type {
  AiApiKey,
  AiProvider,
  AiProviderAdapter,
  AiQuota,
  AiScenario,
  AiScenarioRoute,
  AiUsageMode,
  ConfigureRouteInput,
  GuardrailDecision,
  GuardrailEvent,
  GuardrailRule,
  GuardrailRuleType,
  PlatformUser
} from "../platform-services";
import { PermissionError, ValidationError } from "../platform-services";
import { MemoryAiSecretStore, type AiSecretStore } from "../ai-governance/secret-store";
type DateValue = Date | string;
type ProviderStatus = AiProvider["status"];
type GuardrailSeverity = GuardrailRule["severity"];
type GuardrailScope = GuardrailRule["scope"];
type QuotaScope = AiQuota["scope"];
interface AiProviderRecord {
  id: string;
  name: string;
  adapter: string;
  baseUrl: string;
  models: string[];
  status: ProviderStatus;
  createdAt: DateValue;
}
interface AiApiKeyRecord {
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
interface AiScenarioRouteRecord {
  id: string;
  scenario: string;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string | null;
  fallbackModel?: string | null;
  createdAt?: DateValue;
}

interface AiQuotaRecord {
  id: string;
  scope: string;
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number;
  hardStop: boolean;
  usedToday: number;
  createdAt?: DateValue;
}

interface GuardrailRuleRecord {
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

interface GuardrailEventRecord {
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

interface UpsertProviderArgs {
  where: { id: string };
  update: Partial<AiProviderRecord>;
  create: AiProviderRecord;
}

interface CreateApiKeyArgs {
  data: AiApiKeyRecord;
}

interface UpsertRouteArgs {
  where: { scenario: string };
  update: Partial<AiScenarioRouteRecord>;
  create: AiScenarioRouteRecord;
}

interface UpsertQuotaArgs {
  where: { scope: string };
  update: Partial<AiQuotaRecord>;
  create: AiQuotaRecord;
}

interface UpsertGuardrailRuleArgs {
  where: { id: string };
  update: Partial<GuardrailRuleRecord>;
  create: GuardrailRuleRecord;
}

interface CreateGuardrailEventArgs {
  data: GuardrailEventRecord;
}

export interface AiGovernancePersistenceClient {
  aiProvider: {
    findMany(args?: { orderBy?: { createdAt?: "asc" | "desc" } }): Promise<AiProviderRecord[]>;
    findUnique(args: { where: { id: string } }): Promise<AiProviderRecord | null>;
    upsert(args: UpsertProviderArgs): Promise<AiProviderRecord>;
  };
  aiApiKey: {
    findMany(args?: { orderBy?: { createdAt?: "asc" | "desc" } }): Promise<AiApiKeyRecord[]>;
    create(args: CreateApiKeyArgs): Promise<AiApiKeyRecord>;
  };
  aiScenarioRoute: {
    findMany(args?: { orderBy?: { scenario?: "asc" | "desc" } }): Promise<AiScenarioRouteRecord[]>;
    upsert(args: UpsertRouteArgs): Promise<AiScenarioRouteRecord>;
  };
  aiQuota: {
    findMany(args?: { orderBy?: { scope?: "asc" | "desc" } }): Promise<AiQuotaRecord[]>;
    upsert(args: UpsertQuotaArgs): Promise<AiQuotaRecord>;
  };
  aiQuotaUsage: AiQuotaUsagePersistence;
  guardrailRule: {
    findMany(args?: { orderBy?: { updatedAt?: "asc" | "desc" } }): Promise<GuardrailRuleRecord[]>;
    upsert(args: UpsertGuardrailRuleArgs): Promise<GuardrailRuleRecord>;
  };
  guardrailEvent: {
    findMany(args?: { orderBy?: { occurredAt?: "asc" | "desc" } }): Promise<GuardrailEventRecord[]>;
    create(args: CreateGuardrailEventArgs): Promise<GuardrailEventRecord>;
  };
}

export class AiGovernanceRepositoryBackedService {
  constructor(private readonly client: AiGovernancePersistenceClient, private readonly secretStore: AiSecretStore = new MemoryAiSecretStore()) {}

  async listProviders(actor: PlatformUser): Promise<AiProvider[]> {
    requireAdmin(actor);
    const records = await this.client.aiProvider.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(mapProvider);
  }

  async createProvider(actor: PlatformUser, input: Omit<AiProvider, "id" | "status" | "createdAt">): Promise<AiProvider> {
    requireAdmin(actor);
    if (!input.name.trim()) throw new ValidationError("AI provider name is required");
    if (!input.baseUrl.trim()) throw new ValidationError("AI provider baseUrl is required");
    if (!input.models.length) throw new ValidationError("At least one AI provider model is required");
    const id = slugId("aip", input.name);
    const record = await this.client.aiProvider.upsert({
      where: { id },
      update: {
        name: input.name,
        adapter: input.adapter,
        baseUrl: input.baseUrl,
        models: [...input.models],
        status: "active"
      },
      create: {
        id,
        name: input.name,
        adapter: input.adapter,
        baseUrl: input.baseUrl,
        models: [...input.models],
        status: "active",
        createdAt: new Date()
      }
    });
    return mapProvider(record);
  }

  async listApiKeys(actor: PlatformUser): Promise<AiApiKey[]> {
    requireAdmin(actor);
    const records = await this.client.aiApiKey.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(mapApiKey);
  }

  async createApiKey(
    actor: PlatformUser,
    input: {
      providerId: string;
      name: string;
      secret: string;
      usageMode: AiUsageMode;
      quotaTokens: number;
      fallbackPriority: number;
    }
  ): Promise<AiApiKey> {
    requireAdmin(actor);
    if (!input.name.trim()) throw new ValidationError("AI API key name is required");
    if (!input.secret.trim()) throw new ValidationError("AI API key secret is required");
    const provider = await this.client.aiProvider.findUnique({ where: { id: input.providerId } });
    if (!provider) throw new ValidationError(`Unknown AI provider: ${input.providerId}`);
    const record = await this.client.aiApiKey.create({
      data: {
        id: slugId("aik", `${input.providerId}_${input.name}`),
        providerId: input.providerId,
        name: input.name,
        usageMode: input.usageMode,
        quotaTokens: input.quotaTokens,
        fallbackPriority: input.fallbackPriority,
        fingerprint: fingerprintSecret(input.secret),
        maskedValue: maskSecret(input.secret),
        secretCiphertext: await this.secretStore.write(slugId("aik", `${input.providerId}_${input.name}`), input.secret),
        keyVersion: 1,
        encryptionProvider: this.secretStore.provider,
        status: "active",
        createdAt: new Date()
      }
    });
    return mapApiKey(record);
  }

  async configureRoute(actor: PlatformUser, input: ConfigureRouteInput): Promise<AiScenarioRoute> {
    requireAdmin(actor);
    const provider = await this.client.aiProvider.findUnique({ where: { id: input.primaryProviderId } });
    if (!provider) throw new ValidationError(`Unknown AI provider: ${input.primaryProviderId}`);
    const record = await this.client.aiScenarioRoute.upsert({
      where: { scenario: input.scenario },
      update: {
        primaryProviderId: input.primaryProviderId,
        primaryModel: input.primaryModel,
        fallbackProviderId: input.fallbackProviderId ?? null,
        fallbackModel: input.fallbackModel ?? null
      },
      create: {
        id: slugId("air", input.scenario),
        scenario: input.scenario,
        primaryProviderId: input.primaryProviderId,
        primaryModel: input.primaryModel,
        fallbackProviderId: input.fallbackProviderId ?? null,
        fallbackModel: input.fallbackModel ?? null,
        createdAt: new Date()
      }
    });
    return mapRoute(record);
  }

  async configureQuota(actor: PlatformUser, input: AiQuota): Promise<AiQuota> {
    requireAdmin(actor);
    const record = await this.client.aiQuota.upsert({
      where: { scope: input.scope },
      update: input,
      create: {
        id: slugId("aiq", input.scope),
        ...input,
        createdAt: new Date()
      }
    });
    return mapQuota(record);
  }

  async createGuardrailRule(actor: PlatformUser, input: Omit<GuardrailRule, "id" | "status" | "updatedAt">): Promise<GuardrailRule> {
    requireAdmin(actor);
    if (!input.name.trim()) throw new ValidationError("Guardrail rule name is required");
    const id = slugId("grd", input.name);
    const now = new Date();
    const record = await this.client.guardrailRule.upsert({
      where: { id },
      update: {
        name: input.name,
        type: input.type,
        pattern: input.pattern,
        severity: input.severity,
        action: input.action,
        scope: input.scope,
        status: "active",
        updatedAt: now
      },
      create: {
        id,
        name: input.name,
        type: input.type,
        pattern: input.pattern,
        severity: input.severity,
        action: input.action,
        scope: input.scope,
        status: "active",
        updatedAt: now,
        createdAt: now
      }
    });
    return mapRule(record);
  }

  async testPrompt(actor: PlatformUser, input: { prompt: string; scenario: string }): Promise<{ decision: GuardrailDecision; matchedRule?: GuardrailRule; severity: GuardrailSeverity; eventId: string }> {
    requireAdmin(actor);
    const rules = (await this.client.guardrailRule.findMany()).filter((rule) => rule.status === "active");
    const matched = rules.find((rule) => matchesRule(rule, input.prompt));
    const decision = matched?.action ?? "allow";
    const severity = matched?.severity ?? "info";
    const event = await this.client.guardrailEvent.create({
      data: {
        id: `gre_${Date.now().toString(36)}_${String((await this.client.guardrailEvent.findMany()).length + 1).padStart(4, "0")}`,
        actorUserId: actor.id,
        prompt: input.prompt,
        scenario: input.scenario,
        decision,
        matchedRuleId: matched?.id ?? null,
        matchedRuleName: matched?.name ?? null,
        severity,
        occurredAt: new Date()
      }
    });
    return {
      decision,
      matchedRule: matched ? mapRule(matched) : undefined,
      severity,
      eventId: event.id
    };
  }

  async listGuardrailEvents(actor: PlatformUser): Promise<GuardrailEvent[]> {
    requireAdmin(actor);
    const records = await this.client.guardrailEvent.findMany({ orderBy: { occurredAt: "asc" } });
    return records.map(mapEvent);
  }
}

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
      upsert: async ({ where, update, create }) => upsertById(this.providers, where.id, update, create)
    };
    this.aiApiKey = {
      findMany: async ({ orderBy } = {}) => sortByDate(this.apiKeys, "createdAt", orderBy?.createdAt),
      create: async ({ data }) => {
        const existingIndex = this.apiKeys.findIndex((key) => key.id === data.id);
        if (existingIndex >= 0) this.apiKeys.splice(existingIndex, 1, data);
        else this.apiKeys.push(data);
        return data;
      }
    };
    this.aiScenarioRoute = {
      findMany: async ({ orderBy } = {}) => sortByString(this.routes, "scenario", orderBy?.scenario),
      upsert: async ({ where, update, create }) => upsertByKey(this.routes, "scenario", where.scenario, update, create)
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

export function createAiGovernanceRepositoryBackedService(client: AiGovernancePersistenceClient = new MemoryAiGovernancePersistenceClient(), secretStore?: AiSecretStore): AiGovernanceRepositoryBackedService {
  return new AiGovernanceRepositoryBackedService(client, secretStore);
}

export async function createPrismaAiGovernancePersistence(databaseUrl = process.env.DATABASE_URL, secretStore?: AiSecretStore): Promise<{ client: AiGovernancePersistenceClient; service: AiGovernanceRepositoryBackedService }> {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined) as unknown as AiGovernancePersistenceClient;
  return {
    client,
    service: new AiGovernanceRepositoryBackedService(client, secretStore)
  };
}

function requireAdmin(actor: PlatformUser): void {
  if (actor.role !== "admin") throw new PermissionError(`Role ${actor.role} cannot manage AI governance persistence`);
}

function mapProvider(record: AiProviderRecord): AiProvider {
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

function mapApiKey(record: AiApiKeyRecord): AiApiKey {
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

function mapRoute(record: AiScenarioRouteRecord): AiScenarioRoute {
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

function mapQuota(record: AiQuotaRecord): AiQuota {
  return {
    scope: record.scope as QuotaScope,
    dailyLimit: record.dailyLimit,
    monthlyLimit: record.monthlyLimit,
    warningThreshold: record.warningThreshold,
    hardStop: record.hardStop,
    usedToday: record.usedToday
  };
}

function mapRule(record: GuardrailRuleRecord): GuardrailRule {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    pattern: record.pattern,
    severity: record.severity,
    action: record.action,
    scope: record.scope,
    status: record.status,
    updatedAt: toIsoString(record.updatedAt)
  };
}

function mapEvent(record: GuardrailEventRecord): GuardrailEvent {
  return {
    id: record.id,
    actorId: record.actorUserId,
    prompt: record.prompt,
    scenario: record.scenario,
    decision: record.decision,
    matchedRuleId: record.matchedRuleId ?? undefined,
    matchedRuleName: record.matchedRuleName ?? undefined,
    severity: record.severity,
    occurredAt: toIsoString(record.occurredAt)
  };
}

function matchesRule(rule: GuardrailRuleRecord, prompt: string): boolean {
  if (rule.type === "regex") return new RegExp(rule.pattern, "i").test(prompt);
  return prompt.toLowerCase().includes(rule.pattern.toLowerCase());
}

function slugId(prefix: string, value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${prefix}_${slug || "item"}`;
}

function fingerprintSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

function maskSecret(secret: string): string {
  const suffix = secret.slice(-4);
  return `***${suffix}`;
}

function toIsoString(value: DateValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
    const diff = new Date(left[key] as DateValue).getTime() - new Date(right[key] as DateValue).getTime();
    return direction === "desc" ? -diff : diff;
  });
}

function sortByString<T>(records: T[], key: keyof T, direction: "asc" | "desc" = "asc"): T[] {
  return [...records].sort((left, right) => {
    const diff = String(left[key]).localeCompare(String(right[key]));
    return direction === "desc" ? -diff : diff;
  });
}
