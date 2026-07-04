import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migrationPath = "apps/platform-api/prisma/migrations/20260703000010_sprint11_knowledge_skill_governance/migration.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 11 Prisma schema defines knowledge governance models and relations", () => {
  for (const model of ["KnowledgeSource", "KnowledgeVersion", "KnowledgeApproval", "KnowledgeIndexChunk", "KnowledgeRetrievalLog"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  for (const relation of [
    /knowledgeSources\s+KnowledgeSource\[\]/,
    /knowledgeVersions\s+KnowledgeVersion\[\]/,
    /knowledgeApprovals\s+KnowledgeApproval\[\]/,
    /knowledgeRetrievalLogs\s+KnowledgeRetrievalLog\[\]/,
    /indexChunks\s+KnowledgeIndexChunk\[\]/
  ]) {
    assert.match(schema, relation);
  }
});

test("Sprint 11 Prisma schema defines skill governance models and relations", () => {
  for (const model of ["SkillDefinition", "SkillVersion", "SkillApproval", "SkillAssignment"]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }

  for (const relation of [
    /skillDefinitions\s+SkillDefinition\[\]/,
    /skillVersions\s+SkillVersion\[\]/,
    /skillApprovals\s+SkillApproval\[\]/,
    /skillAssignments\s+SkillAssignment\[\]/
  ]) {
    assert.match(schema, relation);
  }
});

test("Sprint 11 migration creates knowledge and skill governance tables", () => {
  for (const table of [
    "knowledge_sources",
    "knowledge_versions",
    "knowledge_approvals",
    "knowledge_index_chunks",
    "knowledge_retrieval_logs",
    "skill_definitions",
    "skill_versions",
    "skill_approvals",
    "skill_assignments"
  ]) {
    assert.match(migration, new RegExp(table));
  }

  for (const column of [
    "source_type",
    "owner_user_id",
    "scope_type",
    "scope_value",
    "upload_status",
    "index_status",
    "approval_status",
    "lifecycle_status",
    "is_active",
    "content_hash",
    "required_knowledge_source_ids",
    "allowed_tools",
    "agent_role",
    "scenario",
    "retrieval_context"
  ]) {
    assert.match(migration, new RegExp(column));
  }
});

test("Sprint 11 seed includes representative knowledge and skill governance records", () => {
  for (const token of [
    "knowledgeSource",
    "knowledgeVersion",
    "knowledgeApproval",
    "knowledgeIndexChunk",
    "knowledgeRetrievalLog",
    "skillDefinition",
    "skillVersion",
    "skillApproval",
    "skillAssignment",
    "knsrc_leave_policy_001",
    "knver_leave_policy_v1",
    "skdef_frontend_developer_leave",
    "skver_frontend_developer_leave_v1",
    "skassign_frontend_leave_project"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
