import type { PlatformApiClient } from "@evcp/api-client";
import { useCallback, useEffect, useState } from "react";
import {
  approveKnowledgeVersion,
  approveSkillVersion,
  assignSkill,
  createKnowledgeSource,
  createSkill,
  disableSkill,
  listKnowledgeSources,
  listRetrievalLogs,
  listSkills,
  submitKnowledgeVersion,
  submitSkillVersion
} from "./api";
import type {
  AssignSkillInput,
  CreateKnowledgeSourceInput,
  CreateSkillInput,
  KnowledgeRetrievalLog,
  KnowledgeSource,
  KnowledgeVersion,
  SkillDefinition,
  SkillVersion,
  SubmitKnowledgeVersionInput,
  SubmitSkillVersionInput
} from "./types";

export type KnowledgeSkillsAvailability = "loading" | "ready" | "error";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Manages the Knowledge & Skills console: loads the persisted sources/skills/retrieval logs and
// exposes governance mutations. Freshly submitted versions are held in local state (the API has no
// list-versions endpoint) so an admin can approve them in the same session right after submitting.
export function useKnowledgeSkills(client: PlatformApiClient) {
  const [availability, setAvailability] = useState<KnowledgeSkillsAvailability>("loading");
  const [message, setMessage] = useState("Loading knowledge and skills.");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [retrievalLogs, setRetrievalLogs] = useState<KnowledgeRetrievalLog[]>([]);
  const [pendingKnowledge, setPendingKnowledge] = useState<KnowledgeVersion[]>([]);
  const [pendingSkillVersions, setPendingSkillVersions] = useState<SkillVersion[]>([]);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setAvailability("loading");
    try {
      const [nextSources, nextSkills, nextLogs] = await Promise.all([
        listKnowledgeSources(client),
        listSkills(client),
        listRetrievalLogs(client)
      ]);
      setSources(nextSources);
      setSkills(nextSkills);
      setRetrievalLogs(nextLogs);
      setAvailability("ready");
      setMessage(`${nextSources.length} sources · ${nextSkills.length} skills`);
      setError(undefined);
    } catch (caught) {
      setAvailability("error");
      const msg = errorMessage(caught, "Unable to load knowledge and skills.");
      setMessage(msg);
      setError(msg);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setError(undefined);
    try {
      return await action();
    } catch (caught) {
      setError(errorMessage(caught, "Action failed."));
      return undefined;
    }
  }, []);

  const addSource = useCallback(
    (input: CreateKnowledgeSourceInput) =>
      guard(async () => {
        await createKnowledgeSource(client, input);
        await reload();
      }),
    [client, guard, reload]
  );

  const addKnowledgeVersion = useCallback(
    (sourceId: string, input: SubmitKnowledgeVersionInput) =>
      guard(async () => {
        const version = await submitKnowledgeVersion(client, sourceId, input);
        setPendingKnowledge((current) => [version, ...current]);
      }),
    [client, guard]
  );

  const approveKnowledge = useCallback(
    (versionId: string, decision: "approved" | "rejected", note?: string) =>
      guard(async () => {
        const version = await approveKnowledgeVersion(client, versionId, decision, note);
        setPendingKnowledge((current) => current.map((item) => (item.id === version.id ? version : item)));
        await reload();
      }),
    [client, guard, reload]
  );

  const addSkill = useCallback(
    (input: CreateSkillInput) =>
      guard(async () => {
        await createSkill(client, input);
        await reload();
      }),
    [client, guard, reload]
  );

  const addSkillVersion = useCallback(
    (skillId: string, input: SubmitSkillVersionInput) =>
      guard(async () => {
        const version = await submitSkillVersion(client, skillId, input);
        setPendingSkillVersions((current) => [version, ...current]);
      }),
    [client, guard]
  );

  const approveSkill = useCallback(
    (versionId: string, decision: "approved" | "rejected", note?: string) =>
      guard(async () => {
        const version = await approveSkillVersion(client, versionId, decision, note);
        setPendingSkillVersions((current) =>
          current.map((item) => (item.id === version.id ? version : item))
        );
        await reload();
      }),
    [client, guard, reload]
  );

  const turnOffSkill = useCallback(
    (skillId: string, reason: string) =>
      guard(async () => {
        await disableSkill(client, skillId, reason);
        await reload();
      }),
    [client, guard, reload]
  );

  const assign = useCallback(
    (input: AssignSkillInput) =>
      guard(async () => {
        await assignSkill(client, input);
      }),
    [client, guard]
  );

  return {
    availability,
    message,
    error,
    sources,
    skills,
    retrievalLogs,
    pendingKnowledge,
    pendingSkillVersions,
    reload,
    addSource,
    addKnowledgeVersion,
    approveKnowledge,
    addSkill,
    addSkillVersion,
    approveSkill,
    turnOffSkill,
    assign
  };
}

export type KnowledgeSkillsController = ReturnType<typeof useKnowledgeSkills>;
