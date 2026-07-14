CREATE TABLE "project_file_uploads" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "upload_status" TEXT NOT NULL,
  "scan_status" TEXT NOT NULL,
  "index_status" TEXT NOT NULL,
  "extraction_status" TEXT NOT NULL,
  "include_by_default" BOOLEAN NOT NULL DEFAULT true,
  "excerpts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_file_uploads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_file_uploads_project_id_archived_at_idx" ON "project_file_uploads"("project_id", "archived_at");
CREATE UNIQUE INDEX "project_file_uploads_bucket_object_key_key" ON "project_file_uploads"("bucket", "object_key");
