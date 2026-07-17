// Upload limits + allow-list for Creator project-file uploads. Extracted from platform-services.ts
// so that file (a grandfathered large composition hub) can take focused additions without growing.

export const PROJECT_FILE_BUCKET = "project-file-uploads";
export const PROJECT_FILE_MAX_SIZE_BYTES = 25 * 1024 * 1024;
export const PROJECT_FILE_ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/yaml",
  "text/yaml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
