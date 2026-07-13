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

export function useAiGovernance(client: PlatformApiClient) {
  const [availability, setAvailability] = useState<AiGovernanceAvailability>("loading");
  const [message, setMessage] = useState("Loading AI governance data.");
  const [snapshot, setSnapshot] = useState<AiGovernanceSnapshot>(emptySnapshot);

  const reload = useCallback(async () => {
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
  const requireReady = () => {
    if (!canMutateAiGovernance(availability)) throw new Error("AI governance API is unavailable");
  };
  const createProvider = async (input: CreateAiProviderInput): Promise<AiProviderDto> => {
    requireReady();
    const provider = await client.createAiProvider(input);
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
    requireReady();
    if (!secret.trim()) throw new Error("Enter a provider secret before saving.");
    const key = await client.createAiApiKey({ ...input, secret });
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
    requireReady();
    const route = await client.configureAiRoute(input);
    setMessage(`Route configured for ${route.scenario}.`);
    return route;
  };
  const configureQuota = async (input: AiQuotaDto): Promise<AiQuotaDto> => {
    requireReady();
    const quota = await client.configureAiQuota(input);
    setMessage(`Quota configured for ${quota.scope}.`);
    return quota;
  };
  const createGuardrailRule = async (
    input: CreateGuardrailRuleInput
  ): Promise<GuardrailRuleDto> => {
    requireReady();
    const rule = await client.createGuardrailRule(input);
    const guardrailEvents = await client.listGuardrailEvents();
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
