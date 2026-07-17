import type { PlatformRequest, PlatformResponse } from "./platform-http-types";
import type {
  KnowledgeSkillWriter,
  KnowledgeSnapshot,
  SkillSnapshot
} from "./persistence/knowledge-skill-repositories";

// Adds Postgres persistence to the admin knowledge/skill governance routes. The routes themselves
// keep running against the in-memory KnowledgeGovernanceService / SkillGovernanceService (via the
// synchronous request executor passed in); this wrapper mirrors the resulting state to the database
// after each successful mutation so it survives a restart. `executeSync` is injected rather than
// imported to avoid an app-factory <-> routes import cycle.

export function isKnowledgeSkillRoute(request: { path: string }): boolean {
  return request.path.startsWith("/admin/knowledge") || request.path.startsWith("/admin/skills");
}

type SnapshotServices = {
  knowledge: { snapshot(): KnowledgeSnapshot };
  skills: { snapshot(): SkillSnapshot };
};

export async function handleKnowledgeSkillWithPersistence(
  executeSync: (request: PlatformRequest) => PlatformResponse,
  request: PlatformRequest,
  services: SnapshotServices,
  writer: KnowledgeSkillWriter
): Promise<PlatformResponse> {
  const response = executeSync(request);
  // Only POSTs change state (create/version/approve/disable/assign, and retrieve which appends a
  // log). Persist the whole affected snapshot — upsert-only, so it is safe to replay every time.
  if (request.method === "POST" && response.status < 400) {
    if (request.path.startsWith("/admin/knowledge")) await writer.persistKnowledge(services.knowledge.snapshot());
    else if (request.path.startsWith("/admin/skills")) await writer.persistSkill(services.skills.snapshot());
  }
  return response;
}
