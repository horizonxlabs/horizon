import { failure, success, type ApiFailure, type ApiSuccess } from "@evcp/api-client";
import { getMockPermissions } from "@evcp/auth-sdk";
import { appStoreItems, mockUsers, projects as seedProjects } from "@evcp/mock-data";
import type { MockUser, PlatformRole, Status } from "@evcp/types";
import { createHash } from "node:crypto";

export interface PlatformUser extends MockUser {
  status: "active" | "inactive" | "invited" | "suspended";
  permissions: string[];
}

export interface PlatformProject {
  id: string;
  slug: string;
  name: string;
  status: Status;
  ownerUserId: string;
  appId?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  severity: "info" | "warning" | "high" | "critical";
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface CreateProjectInput {
  actor: PlatformUser;
  name: string;
  slug: string;
}

export type AiProviderAdapter = "openai" | "anthropic" | "google" | "azure_openai" | "mock";
export type AiProviderStatus = "active" | "disabled" | "warning" | "error";
export type AiUsageMode = "production" | "development" | "fallback";
export type AiScenario = "prd_generation" | "requirement_analysis" | "frontend_coding" | "backend_coding" | "review" | "documentation";
export type GuardrailDecision = "allow" | "warn" | "block";
export type GuardrailRuleType = "keyword" | "regex" | "policy";

export interface AiProvider {
  id: string;
  name: string;
  adapter: AiProviderAdapter;
  baseUrl: string;
  models: string[];
  status: AiProviderStatus;
  createdAt: string;
}

export interface AiApiKey {
  id: string;
  providerId: string;
  name: string;
  usageMode: AiUsageMode;
  quotaTokens: number;
  fallbackPriority: number;
  fingerprint: string;
  maskedValue: string;
  status: "active" | "disabled";
  createdAt: string;
  lastUsedAt?: string;
}

interface StoredAiApiKey extends AiApiKey {
  secretCiphertext: string;
  keyVersion: number;
  encryptionProvider: "local-envelope";
}

export interface AiScenarioRoute {
  scenario: AiScenario;
  primary: {
    providerId: string;
    model: string;
  };
  fallback?: {
    providerId: string;
    model: string;
  };
}

export interface ConfigureRouteInput {
  scenario: AiScenario;
  primaryProviderId: string;
  primaryModel: string;
  fallbackProviderId?: string;
  fallbackModel?: string;
}

export interface AiQuota {
  scope: "organization" | "creator" | "project" | "app";
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number;
  hardStop: boolean;
  usedToday: number;
}

export interface QuotaDecision {
  allowed: boolean;
  reason: "within_quota" | "quota_warning" | "quota_exceeded";
  remainingToday: number;
}

export interface GuardrailRule {
  id: string;
  name: string;
  type: GuardrailRuleType;
  pattern: string;
  severity: "info" | "warning" | "high" | "critical";
  action: GuardrailDecision;
  scope: "organization" | "project" | "app";
  status: "active" | "disabled";
  updatedAt: string;
}

export interface GuardrailEvent {
  id: string;
  actorId: string;
  prompt: string;
  scenario: string;
  decision: GuardrailDecision;
  matchedRuleId?: string;
  matchedRuleName?: string;
  severity: GuardrailRule["severity"];
  occurredAt: string;
}

export interface GuardrailResult {
  decision: GuardrailDecision;
  matchedRule?: GuardrailRule;
  severity: GuardrailRule["severity"];
  eventId: string;
}

export class MockAuthError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = "MockAuthError";
  }
}

export class PermissionError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

type HeaderBag = Record<string, string | string[] | undefined>;

function toPlatformUser(user: MockUser): PlatformUser {
  return {
    ...user,
    status: "active",
    permissions: getMockPermissions(user.role)
  };
}

function normalizeHeader(headers: HeaderBag, name: string): string | undefined {
  const direct = headers[name];
  const lower = headers[name.toLowerCase()];
  const value = direct ?? lower;

  if (Array.isArray(value)) return value[0];
  return value;
}

export class IdentityService {
  private readonly users = Object.values(mockUsers).map(toPlatformUser);

  listUsers(): PlatformUser[] {
    return [...this.users];
  }

  getUserByEmail(email: string): PlatformUser {
    const user = this.users.find((candidate) => candidate.email === email);
    if (!user) throw new MockAuthError(`Unknown mock user: ${email}`);
    return user;
  }
}

export class AuditService {
  private readonly events: AuditEvent[] = [];

  record(input: Omit<AuditEvent, "id" | "occurredAt" | "severity" | "metadata"> & Partial<Pick<AuditEvent, "severity" | "metadata">>): AuditEvent {
    const event: AuditEvent = {
      id: `aud_${String(this.events.length + 1).padStart(4, "0")}`,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      severity: input.severity ?? "info",
      occurredAt: new Date().toISOString(),
      metadata: input.metadata ?? {}
    };

    this.events.push(event);
    return event;
  }

  list(): AuditEvent[] {
    return [...this.events];
  }
}

export class MockAuthService {
  constructor(private readonly identity: IdentityService) {}

  resolveCurrentUser(headers: HeaderBag): PlatformUser {
    const email = normalizeHeader(headers, "x-mock-user-email") ?? normalizeHeader(headers, "x-evcp-user");
    if (!email) throw new MockAuthError("Missing x-mock-user-email header");
    return this.identity.getUserByEmail(email);
  }

  requireRole(user: PlatformUser, roles: PlatformRole[]): void {
    if (!roles.includes(user.role)) {
      throw new PermissionError(`Role ${user.role} cannot access this resource`);
    }
  }
}

export class ProjectService {
  private readonly projects: PlatformProject[] = seedProjects.map((project) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    status: project.status,
    ownerUserId: mockUsers.creator.id,
    appId: appStoreItems.find((item) => item.slug === project.slug)?.id,
    createdAt: new Date("2026-07-03T00:00:00.000Z").toISOString()
  }));

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  listProjects(): PlatformProject[] {
    return [...this.projects];
  }

  createProject(input: CreateProjectInput): PlatformProject {
    this.auth.requireRole(input.actor, ["admin", "creator"]);

    const project: PlatformProject = {
      id: `prj_${input.slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      slug: input.slug,
      name: input.name,
      status: "draft",
      ownerUserId: input.actor.id,
      appId: `app_${input.slug.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      createdAt: new Date().toISOString()
    };

    const existingIndex = this.projects.findIndex((candidate) => candidate.slug === project.slug);
    if (existingIndex >= 0) this.projects[existingIndex] = project;
    else this.projects.push(project);

    this.audit.record({
      actorId: input.actor.id,
      action: "project.created",
      resourceType: "project",
      resourceId: project.id,
      metadata: { slug: project.slug }
    });

    return project;
  }
}

function slugId(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()}`;
}

function fingerprintSecret(secret: string): string {
  return `fp_${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `sk-...${tail}`;
}

function encryptSecretEnvelope(secret: string): string {
  return `local-envelope:${Buffer.from(secret, "utf8").toString("base64")}`;
}

export class AiGovernanceService {
  private readonly providers: AiProvider[] = [];
  private readonly apiKeys: StoredAiApiKey[] = [];
  private readonly routes: AiScenarioRoute[] = [];
  private readonly quotas: AiQuota[] = [];
  private providerCalls = 0;

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  createProvider(actor: PlatformUser, input: Omit<AiProvider, "id" | "status" | "createdAt">): AiProvider {
    this.requireAdmin(actor, "ai.provider.denied", "ai_provider", input.name);

    const provider: AiProvider = {
      id: slugId("aip", input.name),
      name: input.name,
      adapter: input.adapter,
      baseUrl: input.baseUrl,
      models: [...input.models],
      status: "active",
      createdAt: new Date().toISOString()
    };

    const existing = this.providers.findIndex((candidate) => candidate.id === provider.id);
    if (existing >= 0) this.providers[existing] = provider;
    else this.providers.push(provider);

    this.audit.record({
      actorId: actor.id,
      action: "ai.provider.created",
      resourceType: "ai_provider",
      resourceId: provider.id,
      metadata: { adapter: provider.adapter }
    });

    return provider;
  }

  listProviders(): AiProvider[] {
    return [...this.providers];
  }

  createApiKey(
    actor: PlatformUser,
    input: {
      providerId: string;
      name: string;
      secret: string;
      usageMode: AiUsageMode;
      quotaTokens: number;
      fallbackPriority: number;
    }
  ): AiApiKey {
    this.requireAdmin(actor, "ai.api_key.denied", "ai_api_key", input.name);
    this.requireProvider(input.providerId);

    const stored: StoredAiApiKey = {
      id: slugId("aik", `${input.providerId}_${input.name}`),
      providerId: input.providerId,
      name: input.name,
      usageMode: input.usageMode,
      quotaTokens: input.quotaTokens,
      fallbackPriority: input.fallbackPriority,
      fingerprint: fingerprintSecret(input.secret),
      maskedValue: maskSecret(input.secret),
      status: "active",
      createdAt: new Date().toISOString(),
      secretCiphertext: encryptSecretEnvelope(input.secret),
      keyVersion: 1,
      encryptionProvider: "local-envelope"
    };

    const existing = this.apiKeys.findIndex((candidate) => candidate.id === stored.id);
    if (existing >= 0) this.apiKeys[existing] = stored;
    else this.apiKeys.push(stored);

    this.audit.record({
      actorId: actor.id,
      action: "ai.api_key.created",
      resourceType: "ai_api_key",
      resourceId: stored.id,
      metadata: { providerId: input.providerId, fingerprint: stored.fingerprint }
    });

    return this.toPublicKey(stored);
  }

  listApiKeys(): AiApiKey[] {
    return this.apiKeys.map((key) => this.toPublicKey(key));
  }

  configureRoute(actor: PlatformUser, input: ConfigureRouteInput): AiScenarioRoute {
    this.requireAdmin(actor, "ai.route.denied", "ai_scenario_route", input.scenario);
    this.requireProvider(input.primaryProviderId);
    if (input.fallbackProviderId) this.requireProvider(input.fallbackProviderId);

    const route: AiScenarioRoute = {
      scenario: input.scenario,
      primary: {
        providerId: input.primaryProviderId,
        model: input.primaryModel
      },
      fallback: input.fallbackProviderId
        ? {
            providerId: input.fallbackProviderId,
            model: input.fallbackModel ?? input.primaryModel
          }
        : undefined
    };

    const existing = this.routes.findIndex((candidate) => candidate.scenario === route.scenario);
    if (existing >= 0) this.routes[existing] = route;
    else this.routes.push(route);

    this.audit.record({
      actorId: actor.id,
      action: "ai.route.configured",
      resourceType: "ai_scenario_route",
      resourceId: route.scenario,
      metadata: { primaryProviderId: route.primary.providerId, fallbackProviderId: route.fallback?.providerId }
    });

    return route;
  }

  resolveRoute(scenario: AiScenario): AiScenarioRoute {
    const route = this.routes.find((candidate) => candidate.scenario === scenario);
    if (!route) throw new Error(`No route configured for scenario ${scenario}`);
    return route;
  }

  configureQuota(actor: PlatformUser, input: AiQuota): AiQuota {
    this.requireAdmin(actor, "ai.quota.denied", "ai_quota", input.scope);

    const existing = this.quotas.findIndex((candidate) => candidate.scope === input.scope);
    if (existing >= 0) this.quotas[existing] = input;
    else this.quotas.push(input);

    this.audit.record({
      actorId: actor.id,
      action: "ai.quota.configured",
      resourceType: "ai_quota",
      resourceId: input.scope,
      metadata: { dailyLimit: input.dailyLimit, hardStop: input.hardStop }
    });

    return input;
  }

  checkQuota(scope: AiQuota["scope"], requestedTokens: number): QuotaDecision {
    const quota = this.quotas.find((candidate) => candidate.scope === scope);
    if (!quota) return { allowed: true, reason: "within_quota", remainingToday: Number.MAX_SAFE_INTEGER };

    const remainingToday = Math.max(quota.dailyLimit - quota.usedToday, 0);
    if (quota.hardStop && requestedTokens > remainingToday) {
      return { allowed: false, reason: "quota_exceeded", remainingToday };
    }

    if (quota.usedToday + requestedTokens >= quota.warningThreshold) {
      return { allowed: true, reason: "quota_warning", remainingToday };
    }

    return { allowed: true, reason: "within_quota", remainingToday };
  }

  providerCallCount(): number {
    return this.providerCalls;
  }

  private requireAdmin(actor: PlatformUser, deniedAction: string, resourceType: string, resourceId: string): void {
    try {
      this.auth.requireRole(actor, ["admin"]);
    } catch (error) {
      this.audit.record({
        actorId: actor.id,
        action: deniedAction,
        resourceType,
        resourceId,
        severity: "warning"
      });
      throw error;
    }
  }

  private requireProvider(providerId: string): AiProvider {
    const provider = this.providers.find((candidate) => candidate.id === providerId);
    if (!provider) throw new Error(`Unknown AI provider: ${providerId}`);
    if (provider.status !== "active") throw new Error(`AI provider ${providerId} is not active`);
    return provider;
  }

  private toPublicKey(key: StoredAiApiKey): AiApiKey {
    const { secretCiphertext: _secretCiphertext, keyVersion: _keyVersion, encryptionProvider: _encryptionProvider, ...publicKey } = key;
    return publicKey;
  }
}

export class GuardrailService {
  private readonly rules: GuardrailRule[] = [];
  private readonly events: GuardrailEvent[] = [];

  constructor(
    private readonly auth: MockAuthService,
    private readonly audit: AuditService
  ) {}

  createRule(actor: PlatformUser, input: Omit<GuardrailRule, "id" | "status" | "updatedAt">): GuardrailRule {
    this.auth.requireRole(actor, ["admin"]);

    const rule: GuardrailRule = {
      id: slugId("grd", input.name),
      name: input.name,
      type: input.type,
      pattern: input.pattern,
      severity: input.severity,
      action: input.action,
      scope: input.scope,
      status: "active",
      updatedAt: new Date().toISOString()
    };

    const existing = this.rules.findIndex((candidate) => candidate.id === rule.id);
    if (existing >= 0) this.rules[existing] = rule;
    else this.rules.push(rule);

    this.audit.record({
      actorId: actor.id,
      action: "guardrail.rule.created",
      resourceType: "guardrail_rule",
      resourceId: rule.id,
      metadata: { type: rule.type, action: rule.action }
    });

    return rule;
  }

  listRules(): GuardrailRule[] {
    return [...this.rules];
  }

  testPrompt(actor: PlatformUser, input: { prompt: string; scenario: string }): GuardrailResult {
    this.auth.requireRole(actor, ["admin"]);
    const matchedRule = this.findMatchingRule(input.prompt);
    const classifierDecision = this.classifyPolicy(input.prompt);
    const decision = matchedRule?.action ?? classifierDecision.decision;
    const severity = matchedRule?.severity ?? classifierDecision.severity;
    const event: GuardrailEvent = {
      id: `gre_${String(this.events.length + 1).padStart(4, "0")}`,
      actorId: actor.id,
      prompt: input.prompt,
      scenario: input.scenario,
      decision,
      matchedRuleId: matchedRule?.id,
      matchedRuleName: matchedRule?.name,
      severity,
      occurredAt: new Date().toISOString()
    };

    this.events.push(event);
    this.audit.record({
      actorId: actor.id,
      action: "guardrail.prompt_tested",
      resourceType: "guardrail_event",
      resourceId: event.id,
      severity: decision === "block" ? "high" : decision === "warn" ? "warning" : "info",
      metadata: { decision, scenario: input.scenario, matchedRuleId: matchedRule?.id }
    });

    return {
      decision,
      matchedRule,
      severity,
      eventId: event.id
    };
  }

  listEvents(): GuardrailEvent[] {
    return [...this.events];
  }

  private findMatchingRule(prompt: string): GuardrailRule | undefined {
    return this.rules.find((rule) => {
      if (rule.status !== "active") return false;
      if (rule.type === "keyword") return prompt.toLowerCase().includes(rule.pattern.toLowerCase());
      if (rule.type === "regex") return new RegExp(rule.pattern, "i").test(prompt);
      return false;
    });
  }

  private classifyPolicy(prompt: string): Pick<GuardrailResult, "decision" | "severity"> {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("delete all") || normalized.includes("payroll export")) {
      return { decision: "block", severity: "high" };
    }

    if (normalized.includes("confidential") || normalized.includes("personal data")) {
      return { decision: "warn", severity: "warning" };
    }

    return { decision: "allow", severity: "info" };
  }
}

export interface PlatformApiServices {
  identity: IdentityService;
  auth: MockAuthService;
  audit: AuditService;
  projects: ProjectService;
  aiGovernance: AiGovernanceService;
  guardrails: GuardrailService;
  envelope: {
    success: typeof success;
    failure: typeof failure;
  };
}

export type PlatformApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function createPlatformApiServices(): PlatformApiServices {
  const identity = new IdentityService();
  const auth = new MockAuthService(identity);
  const audit = new AuditService();
  const projects = new ProjectService(auth, audit);
  const aiGovernance = new AiGovernanceService(auth, audit);
  const guardrails = new GuardrailService(auth, audit);

  return {
    identity,
    auth,
    audit,
    projects,
    aiGovernance,
    guardrails,
    envelope: { success, failure }
  };
}
