ALTER TABLE "workspace_tasks"
  ADD COLUMN "knowledge_version_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "skill_version_id" TEXT;

ALTER TABLE "ai_usage_logs"
  ADD COLUMN "knowledge_version_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "skill_version_id" TEXT;

CREATE TABLE "knowledge_sources" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_value" JSONB NOT NULL,
  "project_id" TEXT,
  "app_id" TEXT,
  "department" TEXT,
  "agent_role" TEXT,
  "scenarios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "upload_status" TEXT NOT NULL DEFAULT 'pending',
  "index_status" TEXT NOT NULL DEFAULT 'pending',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_versions" (
  "id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "changelog" TEXT NOT NULL,
  "chunk_count" INTEGER NOT NULL,
  "excerpts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "approval_status" TEXT NOT NULL DEFAULT 'pending',
  "lifecycle_status" TEXT NOT NULL DEFAULT 'pending',
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "approved_by_user_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_approvals" (
  "id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_index_chunks" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "chunk_key" TEXT NOT NULL,
  "heading" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL,
  "embedding_ref" TEXT,
  "status" TEXT NOT NULL DEFAULT 'indexed',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_index_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "knowledge_retrieval_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "project_id" TEXT,
  "app_id" TEXT,
  "department" TEXT,
  "scenario" TEXT NOT NULL,
  "agent_role" TEXT NOT NULL,
  "matched_version_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "denied_version_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "retrieval_context" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_retrieval_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_definitions" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_versions" (
  "id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "instruction" TEXT NOT NULL,
  "input_schema" JSONB NOT NULL,
  "output_schema" JSONB NOT NULL,
  "required_knowledge_source_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowed_tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "content_hash" TEXT NOT NULL,
  "approval_status" TEXT NOT NULL DEFAULT 'pending',
  "lifecycle_status" TEXT NOT NULL DEFAULT 'pending',
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "approved_by_user_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_approvals" (
  "id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_assignments" (
  "id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "skill_version_id" TEXT NOT NULL,
  "agent_role" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_id" TEXT NOT NULL,
  "project_id" TEXT,
  "app_id" TEXT,
  "department" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skill_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_versions_source_id_version_key" ON "knowledge_versions"("source_id", "version");
CREATE UNIQUE INDEX "knowledge_index_chunks_version_id_chunk_key_key" ON "knowledge_index_chunks"("version_id", "chunk_key");
CREATE UNIQUE INDEX "skill_definitions_key_key" ON "skill_definitions"("key");
CREATE UNIQUE INDEX "skill_versions_skill_id_version_key" ON "skill_versions"("skill_id", "version");

CREATE INDEX "knowledge_sources_owner_user_id_status_idx" ON "knowledge_sources"("owner_user_id", "status");
CREATE INDEX "knowledge_sources_project_id_app_id_idx" ON "knowledge_sources"("project_id", "app_id");
CREATE INDEX "knowledge_versions_source_id_approval_status_lifecycle_status_is_active_idx" ON "knowledge_versions"("source_id", "approval_status", "lifecycle_status", "is_active");
CREATE INDEX "knowledge_approvals_version_id_decided_at_idx" ON "knowledge_approvals"("version_id", "decided_at");
CREATE INDEX "knowledge_retrieval_logs_project_id_scenario_agent_role_idx" ON "knowledge_retrieval_logs"("project_id", "scenario", "agent_role");
CREATE INDEX "knowledge_retrieval_logs_actor_user_id_created_at_idx" ON "knowledge_retrieval_logs"("actor_user_id", "created_at");
CREATE INDEX "skill_definitions_owner_user_id_status_idx" ON "skill_definitions"("owner_user_id", "status");
CREATE INDEX "skill_versions_skill_id_approval_status_lifecycle_status_is_active_idx" ON "skill_versions"("skill_id", "approval_status", "lifecycle_status", "is_active");
CREATE INDEX "skill_approvals_version_id_decided_at_idx" ON "skill_approvals"("version_id", "decided_at");
CREATE INDEX "skill_assignments_agent_role_scenario_scope_type_scope_id_status_idx" ON "skill_assignments"("agent_role", "scenario", "scope_type", "scope_id", "status");

ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_approvals" ADD CONSTRAINT "knowledge_approvals_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_approvals" ADD CONSTRAINT "knowledge_approvals_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_approvals" ADD CONSTRAINT "knowledge_approvals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_index_chunks" ADD CONSTRAINT "knowledge_index_chunks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "knowledge_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_retrieval_logs" ADD CONSTRAINT "knowledge_retrieval_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_retrieval_logs" ADD CONSTRAINT "knowledge_retrieval_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_retrieval_logs" ADD CONSTRAINT "knowledge_retrieval_logs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "skill_definitions" ADD CONSTRAINT "skill_definitions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_approvals" ADD CONSTRAINT "skill_approvals_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_approvals" ADD CONSTRAINT "skill_approvals_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "skill_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_approvals" ADD CONSTRAINT "skill_approvals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_skill_version_id_fkey" FOREIGN KEY ("skill_version_id") REFERENCES "skill_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "skill_assignments" ADD CONSTRAINT "skill_assignments_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
