CREATE TABLE "workspace_code_checkpoints" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "commit_sha" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_code_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_code_checkpoints_project_id_commit_sha_key"
  ON "workspace_code_checkpoints"("project_id", "commit_sha");
CREATE UNIQUE INDEX "workspace_code_checkpoints_project_id_tag_key"
  ON "workspace_code_checkpoints"("project_id", "tag");
CREATE INDEX "workspace_code_checkpoints_project_id_created_at_idx"
  ON "workspace_code_checkpoints"("project_id", "created_at");

ALTER TABLE "workspace_code_checkpoints"
  ADD CONSTRAINT "workspace_code_checkpoints_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
