CREATE TABLE "workspace_deployment_revisions" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "commit_sha" TEXT NOT NULL,
  "image_tag" TEXT NOT NULL,
  "image_digest" TEXT NOT NULL,
  "container_id" TEXT,
  "container_name" TEXT NOT NULL,
  "published_by_user_id" TEXT NOT NULL,
  "health_status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_deployment_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_deployment_revisions_project_id_environment_revision_key"
  ON "workspace_deployment_revisions"("project_id", "environment", "revision");
CREATE INDEX "workspace_deployment_revisions_slug_environment_health_status_created_at_idx"
  ON "workspace_deployment_revisions"("slug", "environment", "health_status", "created_at");

ALTER TABLE "app_manifests"
  ADD COLUMN "source_commit_sha" TEXT,
  ADD COLUMN "deployment_revision_id" TEXT;

ALTER TABLE "deployment_records"
  ADD COLUMN "deployment_revision_id" TEXT,
  ADD COLUMN "runtime_revision" INTEGER,
  ADD COLUMN "source_commit_sha" TEXT,
  ADD COLUMN "image_tag" TEXT,
  ADD COLUMN "image_digest" TEXT,
  ADD COLUMN "container_name" TEXT;

CREATE UNIQUE INDEX "deployment_records_deployment_revision_id_key"
  ON "deployment_records"("deployment_revision_id");
ALTER TABLE "deployment_records"
  ADD CONSTRAINT "deployment_records_deployment_revision_id_fkey"
  FOREIGN KEY ("deployment_revision_id") REFERENCES "workspace_deployment_revisions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
