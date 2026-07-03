-- Sprint 3: Creator project metadata and PRD generation lifecycle
ALTER TABLE "projects"
  ADD COLUMN "app_type" TEXT,
  ADD COLUMN "business_problem" TEXT,
  ADD COLUMN "target_department" TEXT,
  ADD COLUMN "intended_users" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "data_sensitivity" TEXT;

CREATE TABLE "prd_documents" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "current_version_id" TEXT,
  "baseline_version_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prd_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prd_versions" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "is_baseline" BOOLEAN NOT NULL DEFAULT false,
  "source_prompt" TEXT NOT NULL,
  "change_summary" TEXT NOT NULL,
  "generated_by" JSONB NOT NULL DEFAULT '{}',
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "prd_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prd_sections" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "order" INTEGER NOT NULL,

  CONSTRAINT "prd_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prd_documents_project_id_key" ON "prd_documents"("project_id");
CREATE INDEX "prd_versions_document_id_idx" ON "prd_versions"("document_id");
CREATE UNIQUE INDEX "prd_sections_version_id_key_key" ON "prd_sections"("version_id", "key");

ALTER TABLE "prd_documents"
  ADD CONSTRAINT "prd_documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prd_versions"
  ADD CONSTRAINT "prd_versions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "prd_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prd_sections"
  ADD CONSTRAINT "prd_sections_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "prd_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prd_documents"
  ADD CONSTRAINT "prd_documents_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "prd_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "prd_documents"
  ADD CONSTRAINT "prd_documents_baseline_version_id_fkey"
  FOREIGN KEY ("baseline_version_id") REFERENCES "prd_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
