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
  PlatformApiClient
} from "@evcp/api-client";
import { useCallback, useEffect, useState } from "react";
import {
  aiGovernanceUnavailableMessage,
  canMutateAiGovernance,
  type AiGovernanceAvailability
} from "../lib/ai-governance-status";

type AiGovernanceSnapshot = {
  providers: AiProviderDto[];
  apiKeys: AiApiKeyDto[];
  guardrailEvents: GuardrailEventDto[];
};
const emptySnapshot: AiGovernanceSnapshot = { providers: [], apiKeys: [], guardrailEvents: [] };

export function useAiGovernance(client: PlatformApiClient | undefined) {
  const [availability, setAvailability] = useState<AiGovernanceAvailability>("loading");
  const [message, setMessage] = useState("Loading AI governance data.");
  const [snapshot, setSnapshot] = useState<AiGovernanceSnapshot>(emptySnapshot);

  const reload = useCallback(async () => {
    if (!client) {
      setSnapshot(emptySnapshot);
      setAvailability("unavailable");
      setMessage(aiGovernanceUnavailableMessage(undefined));
      return;
    }
    setAvailability("loading");
    setMessage("Loading AI governance data.");
    try {
      const [providers, apiKeys, guardrailEvents] = await Promise.all([
        client.listAiProviders(),
        client.listAiApiKeys(),
        client.listGuardrailEvents()
      ]);
      setSnapshot({ providers, apiKeys, guardrailEvents });
      setAvailability("ready");
      setMessage("Loaded AI governance data from Platform API.");
    } catch (error) {
      setSnapshot(emptySnapshot);
      setAvailability("unavailable");
      setMessage(aiGovernanceUnavailableMessage(error));
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);
  const requireReadyClient = (): PlatformApiClient => {
    if (!client) throw new Error("AI governance API is unavailable");
    if (!canMutateAiGovernance(availability)) {
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
    setMessage(`Route configured for ${route.scenario}.`);
    return route;
  };
  const configureQuota = async (input: AiQuotaDto): Promise<AiQuotaDto> => {
    const readyClient = requireReadyClient();
    const quota = await readyClient.configureAiQuota(input);
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
  return {
    availability,
    message,
    ...snapshot,
    reload,
    createProvider,
    saveApiKey,
    configureRoute,
    configureQuota,
    createGuardrailRule
  };
}
