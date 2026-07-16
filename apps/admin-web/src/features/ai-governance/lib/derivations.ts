import type { AiProviderDto, AiQuotaDto, AiScenarioDto, AiScenarioRouteDto, AiApiKeyDto } from "@evcp/api-client";

export const SCENARIOS: readonly AiScenarioDto[] = [
  "prd_generation",
  "requirement_analysis",
  "frontend_coding",
  "backend_coding",
  "review",
  "documentation"
] as const;

export const QUOTA_SCOPES: readonly AiQuotaDto["scope"][] = [
  "organization",
  "creator",
  "project",
  "app"
] as const;

export function routedScenariosByProvider(routes: AiScenarioRouteDto[]): Record<string, AiScenarioDto[]> {
  const map: Record<string, AiScenarioDto[]> = {};
  for (const route of routes) {
    const id = route.primary.providerId;
    (map[id] ??= []).push(route.scenario);
  }
  return map;
}

export function routingMatrixRows(
  routes: AiScenarioRouteDto[],
  providers: AiProviderDto[]
): Array<{ scenario: AiScenarioDto; primary?: { name: string; model: string }; fallback?: { name: string; model: string } }> {
  const nameFor = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  return SCENARIOS.map((scenario) => {
    const route = routes.find((r) => r.scenario === scenario);
    return {
      scenario,
      primary: route ? { name: nameFor(route.primary.providerId), model: route.primary.model } : undefined,
      fallback: route?.fallback ? { name: nameFor(route.fallback.providerId), model: route.fallback.model } : undefined
    };
  });
}

export function quotaRows(quotas: AiQuotaDto[]): Array<{ scope: AiQuotaDto["scope"]; quota?: AiQuotaDto }> {
  return QUOTA_SCOPES.map((scope) => ({ scope, quota: quotas.find((q) => q.scope === scope) }));
}

export function summaryCounts(
  providers: Pick<AiProviderDto, "id">[],
  apiKeys: Pick<AiApiKeyDto, "status">[],
  routes: AiScenarioRouteDto[]
): { providers: number; activeCredentials: number; routed: number } {
  return {
    providers: providers.length,
    activeCredentials: apiKeys.filter((key) => key.status === "active").length,
    routed: new Set(routes.map((r) => r.scenario)).size
  };
}
