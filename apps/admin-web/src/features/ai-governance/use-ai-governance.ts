import type {
  AiApiKeyDto,
  AiProviderDto,
  AiQuotaDto,
  AiScenarioRouteDto,
  CreateAiApiKeyInput,
  CreateAiProviderInput,
  CreateGuardrailRuleInput,
  GuardrailEventDto,
  GuardrailRuleDto,
  PlatformApiClient,
  ProviderModelCatalogDto
} from "@evcp/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  aiGovernanceUnavailableMessage,
  canMutateAiGovernance,
  type AiGovernanceAvailability
} from "./status";

type AiGovernanceSnapshot = {
  providers: AiProviderDto[];
  apiKeys: AiApiKeyDto[];
  routes: AiScenarioRouteDto[];
  quotas: AiQuotaDto[];
  guardrailEvents: GuardrailEventDto[];
};
const emptySnapshot: AiGovernanceSnapshot = {
  providers: [],
  apiKeys: [],
  routes: [],
  quotas: [],
  guardrailEvents: []
};

export function useAiGovernance(client: PlatformApiClient | undefined) {
  const [availability, setAvailability] = useState<AiGovernanceAvailability>("loading");
  const [message, setMessage] = useState("Loading AI governance data.");
  const [snapshot, setSnapshot] = useState<AiGovernanceSnapshot>(emptySnapshot);
  const [snapshotClient, setSnapshotClient] = useState(client);
  const activeClientRef = useRef(client);
  const generationRef = useRef(0);

  if (activeClientRef.current !== client) {
    activeClientRef.current = client;
    generationRef.current += 1;
  }

  const isSnapshotCurrent = snapshotClient === client;
  const visibleSnapshot = isSnapshotCurrent ? snapshot : emptySnapshot;
  const visibleAvailability: AiGovernanceAvailability = isSnapshotCurrent
    ? availability
    : client
      ? "loading"
      : "unavailable";
  const visibleMessage = isSnapshotCurrent
    ? message
    : client
      ? "Loading AI governance data."
      : aiGovernanceUnavailableMessage(undefined);

  const reload = useCallback(async () => {
    const requestGeneration = ++generationRef.current;
    if (!client) {
      if (generationRef.current !== requestGeneration) return;
      setSnapshot(emptySnapshot);
      setSnapshotClient(client);
      setAvailability("unavailable");
      setMessage(aiGovernanceUnavailableMessage(undefined));
      return;
    }
    setSnapshot(emptySnapshot);
    setSnapshotClient(client);
    setAvailability("loading");
    setMessage("Loading AI governance data.");
    try {
      const [providers, apiKeys, routes, quotas, guardrailEvents] = await Promise.all([
        client.listAiProviders(),
        client.listAiApiKeys(),
        client.listAiScenarioRoutes(),
        client.listAiQuotas(),
        client.listGuardrailEvents()
      ]);
      if (generationRef.current !== requestGeneration || activeClientRef.current !== client) return;
      setSnapshot({ providers, apiKeys, routes, quotas, guardrailEvents });
      setAvailability("ready");
      setMessage("Loaded AI governance data from Platform API.");
    } catch (error) {
      if (generationRef.current !== requestGeneration || activeClientRef.current !== client) return;
      setSnapshot(emptySnapshot);
      setSnapshotClient(client);
      setAvailability("unavailable");
      setMessage(aiGovernanceUnavailableMessage(error));
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);
  const requireReadyClient = (): PlatformApiClient => {
    if (!client) throw new Error("AI governance API is unavailable");
    if (!canMutateAiGovernance(visibleAvailability)) {
      throw new Error("AI governance API is unavailable");
    }
    return client;
  };
  const createProvider = async (input: CreateAiProviderInput): Promise<AiProviderDto> => {
    const readyClient = requireReadyClient();
    const provider = await readyClient.createAiProvider(input);
    setSnapshot((current) => ({
      ...current,
      providers: [provider, ...current.providers.filter((item) => item.id !== provider.id)]
    }));
    setMessage(`Provider saved: ${provider.name}`);
    return provider;
  };
  const saveApiKey = async (
    input: Omit<CreateAiApiKeyInput, "secret">,
    secret: string
  ): Promise<AiApiKeyDto> => {
    const readyClient = requireReadyClient();
    if (!secret.trim()) throw new Error("Enter a provider secret before saving.");
    const key = await readyClient.createAiApiKey({ ...input, secret });
    setSnapshot((current) => ({
      ...current,
      apiKeys: [key, ...current.apiKeys.filter((item) => item.id !== key.id)]
    }));
    setMessage(`Masked key saved for ${key.providerId}.`);
    return key;
  };
  const configureRoute = async (
    input: Parameters<PlatformApiClient["configureAiRoute"]>[0]
  ): Promise<AiScenarioRouteDto> => {
    const readyClient = requireReadyClient();
    const route = await readyClient.configureAiRoute(input);
    setSnapshot((current) => ({
      ...current,
      routes: [route, ...current.routes.filter((item) => item.scenario !== route.scenario)]
    }));
    setMessage(`Route configured for ${route.scenario}.`);
    return route;
  };
  const configureQuota = async (input: AiQuotaDto): Promise<AiQuotaDto> => {
    const readyClient = requireReadyClient();
    const quota = await readyClient.configureAiQuota(input);
    setSnapshot((current) => ({
      ...current,
      quotas: [quota, ...current.quotas.filter((item) => item.scope !== quota.scope)]
    }));
    setMessage(`Quota configured for ${quota.scope}.`);
    return quota;
  };
  const createGuardrailRule = async (
    input: CreateGuardrailRuleInput
  ): Promise<GuardrailRuleDto> => {
    const readyClient = requireReadyClient();
    const rule = await readyClient.createGuardrailRule(input);
    const guardrailEvents = await readyClient.listGuardrailEvents();
    setSnapshot((current) => ({ ...current, guardrailEvents }));
    setMessage(`Guardrail active: ${rule.name}`);
    return rule;
  };
  const testProvider = async (input: Parameters<PlatformApiClient["testAiProvider"]>[0]) => {
    const readyClient = requireReadyClient();
    return readyClient.testAiProvider(input);
  };
  const loadModelCatalog = useCallback(
    async (baseUrl: string): Promise<ProviderModelCatalogDto> => {
      if (!client) throw new Error("AI governance API is unavailable");
      return client.listProviderModelCatalog(baseUrl);
    },
    [client]
  );
  return {
    availability: visibleAvailability,
    message: visibleMessage,
    ...visibleSnapshot,
    reload,
    createProvider,
    saveApiKey,
    configureRoute,
    configureQuota,
    createGuardrailRule,
    testProvider,
    loadModelCatalog
  };
}
