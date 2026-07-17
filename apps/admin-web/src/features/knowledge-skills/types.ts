// DTO shapes for the Knowledge & Skills admin console. These mirror the Platform API governance
// responses (`/admin/knowledge/*`, `/admin/skills/*`). They live in the feature — not `@evcp/api-client`
// — because only the admin console consumes them and the shared client barrel is a frozen large file.

export type KnowledgeSourceType =
  | "pdf"
  | "markdown"
  | "text"
  | "word"
  | "excel"
  | "image"
  | "openapi_json";
export type KnowledgeSourceStatus = "draft" | "active" | "deprecated" | "archived";
export type KnowledgeUploadStatus = "pending" | "uploaded" | "failed";
export type KnowledgeIndexStatus = "pending" | "indexed" | "failed";
export type VersionApprovalStatus = "pending" | "approved" | "rejected";
export type VersionLifecycleStatus = "pending" | "active" | "superseded" | "rejected";
export type GovernanceApprovalDecision = "approved" | "rejected";
export type SkillStatus = "draft" | "active" | "disabled" | "deprecated";

export type AgentRoleKey =
  | "requirement_analyst"
  | "database_designer"
  | "frontend_developer"
  | "backend_developer"
  | "security_reviewer"
  | "technical_writer";
export type AiScenario =
  | "prd_generation"
  | "requirement_analysis"
  | "frontend_coding"
  | "backend_coding"
  | "review"
  | "documentation";
export type ScopeVisibility = "global" | "department" | "project" | "app" | "agent";

export interface GovernanceScope {
  visibility: ScopeVisibility;
  department?: string;
  projectIds?: string[];
  appIds?: string[];
  agentRoles?: AgentRoleKey[];
  scenarios?: AiScenario[];
}

export interface KnowledgeSource {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  ownerUserId: string;
  scope: GovernanceScope;
  uploadStatus: KnowledgeUploadStatus;
  indexStatus: KnowledgeIndexStatus;
  status: KnowledgeSourceStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeVersion {
  id: string;
  sourceId: string;
  version: string;
  contentHash: string;
  changelog: string;
  chunkCount: number;
  excerpts: string[];
  approvalStatus: VersionApprovalStatus;
  lifecycleStatus: VersionLifecycleStatus;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
}

export interface KnowledgeRetrievalLog {
  id: string;
  actorUserId: string;
  projectId?: string;
  appId?: string;
  department?: string;
  agentRole: AgentRoleKey;
  scenario: AiScenario;
  matchedVersionIds: string[];
  deniedVersionIds: string[];
  retrievalContext: Record<string, unknown>;
  createdAt: string;
}

export interface SkillDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  ownerUserId: string;
  status: SkillStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  instruction: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredKnowledgeSourceIds: string[];
  allowedTools: string[];
  approvalStatus: VersionApprovalStatus;
  lifecycleStatus: VersionLifecycleStatus;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
}

export interface SkillAssignment {
  id: string;
  skillId: string;
  skillVersionId: string;
  agentRole: AgentRoleKey;
  scenario: AiScenario;
  scopeType: ScopeVisibility;
  scopeId: string;
  priority: number;
  status: "active" | "disabled";
  createdAt: string;
}

export interface CreateKnowledgeSourceInput {
  title: string;
  sourceType: KnowledgeSourceType;
  scope: GovernanceScope;
  tags?: string[];
}

export interface SubmitKnowledgeVersionInput {
  contentHash: string;
  changelog: string;
  chunkCount: number;
  excerpts?: string[];
}

export interface CreateSkillInput {
  key: string;
  name: string;
  description?: string;
}

export interface SubmitSkillVersionInput {
  instruction: string;
  requiredKnowledgeSourceIds?: string[];
  allowedTools?: string[];
}

export interface AssignSkillInput {
  skillVersionId: string;
  agentRole: AgentRoleKey;
  scenario: AiScenario;
  scopeType: ScopeVisibility;
  scopeId: string;
  priority: number;
}

export const KNOWLEDGE_SOURCE_TYPES: KnowledgeSourceType[] = [
  "markdown",
  "text",
  "pdf",
  "word",
  "excel",
  "image",
  "openapi_json"
];
export const SCOPE_VISIBILITIES: ScopeVisibility[] = ["global", "department", "project", "app", "agent"];
export const AGENT_ROLES: AgentRoleKey[] = [
  "requirement_analyst",
  "database_designer",
  "frontend_developer",
  "backend_developer",
  "security_reviewer",
  "technical_writer"
];
export const AI_SCENARIOS: AiScenario[] = [
  "prd_generation",
  "requirement_analysis",
  "frontend_coding",
  "backend_coding",
  "review",
  "documentation"
];
