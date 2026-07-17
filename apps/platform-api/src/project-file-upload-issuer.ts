import { createMinioProjectFileUploadUrlIssuer, type ProjectFileUploadUrlIssuer } from "./workspace-orchestrator/minio-object-storage";

/** Builds the MinIO-backed upload-URL issuer when object storage is configured; undefined otherwise.
 * Extracted from app-factory.ts (a grandfathered large file) to keep it under its size ceiling. */
export function resolveProjectFileUploadUrlIssuer(
  env: Record<string, string | undefined>
): ProjectFileUploadUrlIssuer | undefined {
  if (!(env.EVCP_S3_PUBLIC_URL && env.MINIO_ROOT_USER && env.MINIO_ROOT_PASSWORD)) return undefined;
  return createMinioProjectFileUploadUrlIssuer({
    endPoint: env.EVCP_S3_HOST ?? "minio",
    port: Number(env.EVCP_S3_PORT ?? 9000),
    useSSL: env.EVCP_S3_SSL === "true",
    accessKey: env.MINIO_ROOT_USER,
    secretKey: env.MINIO_ROOT_PASSWORD,
    publicBaseUrl: env.EVCP_S3_PUBLIC_URL
  });
}
