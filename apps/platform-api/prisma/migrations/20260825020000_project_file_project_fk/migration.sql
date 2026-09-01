ALTER TABLE "project_file_uploads"
  ADD CONSTRAINT "project_file_uploads_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
