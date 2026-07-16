import { HttpStatus } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import { handleAiProviderTestCall, handleLegacyAiProviderTestCall } from "./provider-test-route";
import { handleProviderCatalogRoute } from "./provider-catalog";
import type { GovernedAiExecutor } from "./execution-service";
import type { AiGovernanceRepositoryBackedService } from "../persistence/ai-governance-repositories";
import type {
  HeaderBag,
  PersistenceAwarePlatformApiServices,
  PlatformRequest,
  PlatformResponse
} from "../app-factory";
import type { PlatformUser } from "../platform-services";

/**
 * Handles the persistence-backed AI-governance + guardrail HTTP routes extracted from
 * app-factory's async request dispatcher. Returns the matched response, or `undefined` when no
 * AI/guardrail path matched (or persistence is disabled) so the caller can fall through — the
 * async dispatcher ultimately delegates to the sync dispatcher, which serves the in-memory
 * handlers via {@link handleInMemoryAiGovernanceRoute}.
 */
export async function handleAiGovernanceRoute(
  request: PlatformRequest,
  ctx: {
    services: PersistenceAwarePlatformApiServices;
    aiGovernancePersistence: AiGovernanceRepositoryBackedService | undefined;
    governedAiExecutor: GovernedAiExecutor | undefined;
    resolvePersistenceUser: (
      services: PersistenceAwarePlatformApiServices,
      headers: HeaderBag
    ) => Promise<PlatformUser>;
  }
): Promise<PlatformResponse | undefined> {
  const { services, resolvePersistenceUser } = ctx;

  if (ctx.aiGovernancePersistence) {
    const aiGovernancePersistence = ctx.aiGovernancePersistence;
    const governedAiExecutor = ctx.governedAiExecutor;

    if (aiGovernancePersistence && request.method === "GET" && request.path === "/ai/providers") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await aiGovernancePersistence.listProviders(user))
      };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/providers") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const provider = await aiGovernancePersistence.createProvider(user, {
        name: String(request.body?.name ?? ""),
        adapter: String(request.body?.adapter ?? "mock") as never,
        baseUrl: String(request.body?.baseUrl ?? ""),
        models: Array.isArray(request.body?.models) ? request.body.models.map(String) : []
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (aiGovernancePersistence && request.method === "GET" && request.path === "/ai/api-keys") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await aiGovernancePersistence.listApiKeys(user))
      };
    }

    if (request.method === "GET" && request.path === "/ai/routes") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await aiGovernancePersistence.listRoutes(user))
      };
    }

    if (request.method === "GET" && request.path === "/ai/quotas") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await aiGovernancePersistence.listQuotas(user))
      };
    }

    if (request.method === "POST" && request.path === "/ai/provider-catalog") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return handleProviderCatalogRoute({ request, user });
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/api-keys") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const key = await aiGovernancePersistence.createApiKey(user, {
        providerId: String(request.body?.providerId ?? ""),
        name: String(request.body?.name ?? ""),
        secret: String(request.body?.secret ?? ""),
        usageMode: String(request.body?.usageMode ?? "production") as never,
        quotaTokens: Number(request.body?.quotaTokens ?? 0),
        fallbackPriority: Number(request.body?.fallbackPriority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(key) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/routes") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const route = await aiGovernancePersistence.configureRoute(user, {
        scenario: String(request.body?.scenario ?? "prd_generation") as never,
        primaryProviderId: String(request.body?.primaryProviderId ?? ""),
        primaryModel: String(request.body?.primaryModel ?? ""),
        fallbackProviderId: request.body?.fallbackProviderId
          ? String(request.body.fallbackProviderId)
          : undefined,
        fallbackModel: request.body?.fallbackModel ? String(request.body.fallbackModel) : undefined
      });
      return { status: HttpStatus.OK, body: success(route) };
    }

    if (aiGovernancePersistence && request.method === "POST" && request.path === "/ai/quotas") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const quota = await aiGovernancePersistence.configureQuota(user, {
        scope: String(request.body?.scope ?? "organization") as never,
        dailyLimit: Number(request.body?.dailyLimit ?? 0),
        monthlyLimit: Number(request.body?.monthlyLimit ?? 0),
        warningThreshold: Number(request.body?.warningThreshold ?? 0),
        hardStop: Boolean(request.body?.hardStop ?? true),
        usedToday: Number(request.body?.usedToday ?? 0)
      });
      return { status: HttpStatus.OK, body: success(quota) };
    }

    if (
      aiGovernancePersistence &&
      request.method === "POST" &&
      request.path === "/guardrails/rules"
    ) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const rule = await aiGovernancePersistence.createGuardrailRule(user, {
        name: String(request.body?.name ?? ""),
        type: String(request.body?.type ?? "keyword") as never,
        pattern: String(request.body?.pattern ?? ""),
        severity: String(request.body?.severity ?? "warning") as never,
        action: String(request.body?.action ?? "warn") as never,
        scope: String(request.body?.scope ?? "organization") as never
      });
      return { status: HttpStatus.CREATED, body: success(rule) };
    }

    if (
      aiGovernancePersistence &&
      request.method === "POST" &&
      request.path === "/guardrails/test"
    ) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const result = await aiGovernancePersistence.testPrompt(user, {
        prompt: String(request.body?.prompt ?? ""),
        scenario: String(request.body?.scenario ?? "prd_generation")
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (
      aiGovernancePersistence &&
      request.method === "GET" &&
      request.path === "/guardrails/events"
    ) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return {
        status: HttpStatus.OK,
        body: success(await aiGovernancePersistence.listGuardrailEvents(user))
      };
    }

    if (
      aiGovernancePersistence &&
      governedAiExecutor &&
      request.method === "POST" &&
      request.path === "/ai/provider-test-call"
    ) {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      const result = await handleAiProviderTestCall({
        request,
        resolveUser: async () => user,
        executor: governedAiExecutor,
        providerNameFor: async (id) =>
          (await aiGovernancePersistence.listProviders(user)).find((provider) => provider.id === id)
            ?.name,
        providerAdapterFor: async (id) =>
          (await aiGovernancePersistence.listProviders(user)).find((provider) => provider.id === id)
            ?.adapter,
        legacyTest: () => {
          throw new Error("legacy AI test is unavailable in persistence mode");
        }
      });
      return {
        status: result?.status ?? HttpStatus.NOT_FOUND,
        body: result?.body ?? failure("NOT_FOUND", "route not found")
      };
    }

    return undefined;
  }

  return undefined;
}

/**
 * Handles the in-memory AI-governance + guardrail HTTP routes. These are the handlers that
 * originally lived in app-factory's synchronous `executePlatformApiRequest` dispatcher; they are
 * all synchronous (`services.auth.*`, `services.aiGovernance.*`, `services.guardrails.*`,
 * `handleLegacyAiProviderTestCall`). Returns the matched response, or `undefined` if no
 * AI/guardrail path matched so the caller can fall through.
 */
export function handleInMemoryAiGovernanceRoute(
  request: PlatformRequest,
  services: PersistenceAwarePlatformApiServices
): PlatformResponse | undefined {
  if (request.method === "GET" && request.path === "/ai/providers") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    services.auth.requireRole(user, ["admin"]);
    return { status: HttpStatus.OK, body: success(services.aiGovernance.listProviders()) };
  }

  if (request.method === "POST" && request.path === "/ai/providers") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const provider = services.aiGovernance.createProvider(user, {
      name: String(request.body?.name ?? ""),
      adapter: String(request.body?.adapter ?? "mock") as never,
      baseUrl: String(request.body?.baseUrl ?? ""),
      models: Array.isArray(request.body?.models) ? request.body.models.map(String) : []
    });
    return { status: HttpStatus.CREATED, body: success(provider) };
  }

  if (request.method === "GET" && request.path === "/ai/api-keys") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    services.auth.requireRole(user, ["admin"]);
    return { status: HttpStatus.OK, body: success(services.aiGovernance.listApiKeys()) };
  }

  if (request.method === "GET" && request.path === "/ai/routes") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    services.auth.requireRole(user, ["admin"]);
    return { status: HttpStatus.OK, body: success(services.aiGovernance.listRoutes()) };
  }

  if (request.method === "GET" && request.path === "/ai/quotas") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    services.auth.requireRole(user, ["admin"]);
    return { status: HttpStatus.OK, body: success(services.aiGovernance.listQuotas()) };
  }

  if (request.method === "POST" && request.path === "/ai/api-keys") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const key = services.aiGovernance.createApiKey(user, {
      providerId: String(request.body?.providerId ?? ""),
      name: String(request.body?.name ?? ""),
      secret: String(request.body?.secret ?? ""),
      usageMode: String(request.body?.usageMode ?? "production") as never,
      quotaTokens: Number(request.body?.quotaTokens ?? 0),
      fallbackPriority: Number(request.body?.fallbackPriority ?? 0)
    });
    return { status: HttpStatus.CREATED, body: success(key) };
  }

  if (request.method === "POST" && request.path === "/ai/routes") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const route = services.aiGovernance.configureRoute(user, {
      scenario: String(request.body?.scenario ?? "prd_generation") as never,
      primaryProviderId: String(request.body?.primaryProviderId ?? ""),
      primaryModel: String(request.body?.primaryModel ?? ""),
      fallbackProviderId: request.body?.fallbackProviderId
        ? String(request.body.fallbackProviderId)
        : undefined,
      fallbackModel: request.body?.fallbackModel ? String(request.body.fallbackModel) : undefined
    });
    return { status: HttpStatus.OK, body: success(route) };
  }

  if (request.method === "POST" && request.path === "/ai/quotas") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const quota = services.aiGovernance.configureQuota(user, {
      scope: String(request.body?.scope ?? "organization") as never,
      dailyLimit: Number(request.body?.dailyLimit ?? 0),
      monthlyLimit: Number(request.body?.monthlyLimit ?? 0),
      warningThreshold: Number(request.body?.warningThreshold ?? 0),
      hardStop: Boolean(request.body?.hardStop ?? true),
      usedToday: Number(request.body?.usedToday ?? 0)
    });
    return { status: HttpStatus.OK, body: success(quota) };
  }

  if (request.method === "POST" && request.path === "/ai/provider-test-call") {
    const result = handleLegacyAiProviderTestCall({
      request,
      resolveUser: () => services.auth.resolveCurrentUser(request.headers ?? {}),
      legacyTest: (user, input) => services.aiGovernance.testProviderCall(user, input)
    });
    return {
      status: result?.status ?? HttpStatus.NOT_FOUND,
      body: result?.body ?? failure("NOT_FOUND", "route not found")
    };
  }

  if (request.method === "POST" && request.path === "/guardrails/rules") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const rule = services.guardrails.createRule(user, {
      name: String(request.body?.name ?? ""),
      type: String(request.body?.type ?? "keyword") as never,
      pattern: String(request.body?.pattern ?? ""),
      severity: String(request.body?.severity ?? "warning") as never,
      action: String(request.body?.action ?? "warn") as never,
      scope: String(request.body?.scope ?? "organization") as never
    });
    return { status: HttpStatus.CREATED, body: success(rule) };
  }

  if (request.method === "POST" && request.path === "/guardrails/test") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    const result = services.guardrails.testPrompt(user, {
      prompt: String(request.body?.prompt ?? ""),
      scenario: String(request.body?.scenario ?? "prd_generation")
    });
    return { status: HttpStatus.OK, body: success(result) };
  }

  if (request.method === "GET" && request.path === "/guardrails/events") {
    const user = services.auth.resolveCurrentUser(request.headers ?? {});
    services.auth.requireRole(user, ["admin"]);
    return { status: HttpStatus.OK, body: success(services.guardrails.listEvents()) };
  }

  return undefined;
}
