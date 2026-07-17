import type { PlatformApiClient } from "@evcp/api-client";
import type {
  AssignSkillInput,
  CreateKnowledgeSourceInput,
  CreateSkillInput,
  GovernanceApprovalDecision,
  KnowledgeRetrievalLog,
  KnowledgeSource,
  KnowledgeVersion,
  SkillAssignment,
  SkillDefinition,
  SkillVersion,
  SubmitKnowledgeVersionInput,
  SubmitSkillVersionInput
} from "./types";

// Thin wrappers over the public `client.request` facade. The Platform API returns the governance
// entities directly inside the `{ ok, data }` envelope that `request` already unwraps, so each call
// resolves to the bare DTO. POST bodies mirror the app-factory handlers verbatim.

function post<T>(client: PlatformApiClient, path: string, body: unknown): Promise<T> {
  return client.request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function listKnowledgeSources(client: PlatformApiClient): Promise<KnowledgeSource[]> {
  return client.request<KnowledgeSource[]>("/admin/knowledge/sources");
}

export function createKnowledgeSource(
  client: PlatformApiClient,
  input: CreateKnowledgeSourceInput
): Promise<KnowledgeSource> {
  return post<KnowledgeSource>(client, "/admin/knowledge/sources", input);
}

export function submitKnowledgeVersion(
  client: PlatformApiClient,
  sourceId: string,
  input: SubmitKnowledgeVersionInput
): Promise<KnowledgeVersion> {
  return post<KnowledgeVersion>(
    client,
    `/admin/knowledge/sources/${encodeURIComponent(sourceId)}/versions`,
    input
  );
}

export function approveKnowledgeVersion(
  client: PlatformApiClient,
  versionId: string,
  decision: GovernanceApprovalDecision,
  note?: string
): Promise<KnowledgeVersion> {
  return post<KnowledgeVersion>(
    client,
    `/admin/knowledge/versions/${encodeURIComponent(versionId)}/approve`,
    { decision, note }
  );
}

export function listRetrievalLogs(client: PlatformApiClient): Promise<KnowledgeRetrievalLog[]> {
  return client.request<KnowledgeRetrievalLog[]>("/admin/knowledge/retrieval-logs");
}

export function listSkills(client: PlatformApiClient): Promise<SkillDefinition[]> {
  return client.request<SkillDefinition[]>("/admin/skills");
}

export function createSkill(client: PlatformApiClient, input: CreateSkillInput): Promise<SkillDefinition> {
  return post<SkillDefinition>(client, "/admin/skills", input);
}

export function submitSkillVersion(
  client: PlatformApiClient,
  skillId: string,
  input: SubmitSkillVersionInput
): Promise<SkillVersion> {
  return post<SkillVersion>(client, `/admin/skills/${encodeURIComponent(skillId)}/versions`, input);
}

export function approveSkillVersion(
  client: PlatformApiClient,
  versionId: string,
  decision: GovernanceApprovalDecision,
  note?: string
): Promise<SkillVersion> {
  return post<SkillVersion>(
    client,
    `/admin/skills/versions/${encodeURIComponent(versionId)}/approve`,
    { decision, note }
  );
}

export function disableSkill(
  client: PlatformApiClient,
  skillId: string,
  reason: string
): Promise<SkillDefinition> {
  return post<SkillDefinition>(client, `/admin/skills/${encodeURIComponent(skillId)}/disable`, { reason });
}

export function assignSkill(client: PlatformApiClient, input: AssignSkillInput): Promise<SkillAssignment> {
  return post<SkillAssignment>(client, "/admin/skills/assignments", input);
}
