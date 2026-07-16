import { createHash } from "node:crypto";
import type { AiQuotaUsagePersistence } from "./ai-quota-usage-store";
import { mapProvider, mapApiKey, mapRoute, mapQuota } from "./ai-governance-mappers";
import { MemoryAiGovernancePersistenceClient } from "./ai-governance-memory-client";
import type {
  AiApiKey,
  AiProvider,
  AiQuota,
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
    delete(args: { where: { id: string } }): Promise<void>;
  };
  aiApiKey: {
    findMany(args?: { orderBy?: { createdAt?: "asc" | "desc" } }): Promise<AiApiKeyRecord[]>;
    create(args: CreateApiKeyArgs): Promise<AiApiKeyRecord>;
    update(args: { where: { id: string }; data: { status: "active" | "disabled" } }): Promise<AiApiKeyRecord>;
    delete(args: { where: { id: string } }): Promise<void>;
  };
  aiScenarioRoute: {
    findMany(args?: { orderBy?: { scenario?: "asc" | "desc" } }): Promise<AiScenarioRouteRecord[]>;
    upsert(args: UpsertRouteArgs): Promise<AiScenarioRouteRecord>;
    deleteMany(args: { where: { OR: Array<{ primaryProviderId?: string; fallbackProviderId?: string }> } }): Promise<void>;
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

  async updateProvider(actor: PlatformUser, providerId: string, input: { name: string; baseUrl: string; models: string[] }): Promise<AiProvider> {
    requireAdmin(actor);
    if (!input.name.trim()) throw new ValidationError("AI provider name is required");
    if (!input.baseUrl.trim()) throw new ValidationError("AI provider baseUrl is required");
    if (!input.models.length) throw new ValidationError("At least one AI provider model is required");
    const existing = await this.client.aiProvider.findUnique({ where: { id: providerId } });
    if (!existing) throw new ValidationError(`Unknown AI provider: ${providerId}`);
    const record = await this.client.aiProvider.upsert({
      where: { id: providerId },
      update: { name: input.name, baseUrl: input.baseUrl, models: [...input.models] },
      create: { ...existing, name: input.name, baseUrl: input.baseUrl, models: [...input.models] }
    });
    return mapProvider(record);
  }

  async listApiKeys(actor: PlatformUser): Promise<AiApiKey[]> {
    requireAdmin(actor);
    const records = await this.client.aiApiKey.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(mapApiKey);
  }

  async listRoutes(actor: PlatformUser): Promise<AiScenarioRoute[]> {
    requireAdmin(actor);
    const records = await this.client.aiScenarioRoute.findMany({ orderBy: { scenario: "asc" } });
    return records.map(mapRoute);
  }

  async listQuotas(actor: PlatformUser): Promise<AiQuota[]> {
    requireAdmin(actor);
    const records = await this.client.aiQuota.findMany({ orderBy: { scope: "asc" } });
    return records.map(mapQuota);
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

  async setProviderStatus(actor: PlatformUser, providerId: string, status: ProviderStatus): Promise<AiProvider> {
    requireAdmin(actor);
    const existing = await this.client.aiProvider.findUnique({ where: { id: providerId } });
    if (!existing) throw new ValidationError(`Unknown AI provider: ${providerId}`);
    const record = await this.client.aiProvider.upsert({
      where: { id: providerId },
      update: { status },
      create: { ...existing, status }
    });
    return mapProvider(record);
  }

  async deleteProvider(actor: PlatformUser, providerId: string): Promise<void> {
    requireAdmin(actor);
    const keys = await this.client.aiApiKey.findMany();
    for (const key of keys.filter((candidate) => candidate.providerId === providerId)) {
      await this.client.aiApiKey.delete({ where: { id: key.id } });
    }
    await this.client.aiScenarioRoute.deleteMany({ where: { OR: [{ primaryProviderId: providerId }, { fallbackProviderId: providerId }] } });
    await this.client.aiProvider.delete({ where: { id: providerId } });
  }

  async setApiKeyStatus(actor: PlatformUser, keyId: string, status: "active" | "disabled"): Promise<AiApiKey> {
    requireAdmin(actor);
    const record = await this.client.aiApiKey.update({ where: { id: keyId }, data: { status } });
    return mapApiKey(record);
  }

  async deleteApiKey(actor: PlatformUser, keyId: string): Promise<void> {
    requireAdmin(actor);
    await this.client.aiApiKey.delete({ where: { id: keyId } });
  }
}

export { MemoryAiGovernancePersistenceClient };

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
