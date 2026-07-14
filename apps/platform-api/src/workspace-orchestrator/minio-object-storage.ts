import { Client as MinioClient } from "minio";
import { bucketNameFor, type ObjectStorageProvisioner } from "./resource-ports";

// Re-exported so callers outside apps/platform-api's node_modules ancestry (e.g. the live
// integration test in tests/integration/) can construct a real MinIO client without a bare
// `minio` import, which pnpm's isolated node_modules layout would fail to resolve there.
export { MinioClient };

export interface MinioLike {
  bucketExists(name: string): Promise<boolean>;
  makeBucket(name: string, region?: string): Promise<void>;
  removeBucket(name: string): Promise<void>;
}

interface MinioPresignLike {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<void>;
  presignedPutObject(bucket: string, objectKey: string, expirySeconds: number): Promise<string>;
}

export interface ProjectFileUploadUrlIssuer {
  issue(bucket: string, objectKey: string): Promise<{ url: string; expiresAt: Date }>;
}

/**
 * Signs browser uploads with server-held MinIO credentials. `publicBaseUrl` must name the same
 * object-storage endpoint from the browser's network; it is intentionally explicit to avoid
 * leaking Docker-only hostnames such as `minio` into Creator responses.
 */
export function createMinioProjectFileUploadUrlIssuer(opts: Omit<MinioProvisionerOptions, "clientFactory"> & {
  publicBaseUrl: string;
  clientFactory?: (cfg: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
  }) => MinioPresignLike;
  signingClientFactory?: (cfg: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
  }) => Pick<MinioPresignLike, "presignedPutObject">;
}): ProjectFileUploadUrlIssuer {
  const managementClient = opts.clientFactory
    ? opts.clientFactory(opts)
    : (new MinioClient({ endPoint: opts.endPoint, port: opts.port, useSSL: opts.useSSL, accessKey: opts.accessKey, secretKey: opts.secretKey }) as unknown as MinioPresignLike);
  const publicUrl = new URL(opts.publicBaseUrl);
  if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
    throw new Error("EVCP_S3_PUBLIC_URL must be an origin without a path, query, or fragment");
  }
  const signingOptions = {
    endPoint: publicUrl.hostname,
    port: publicUrl.port ? Number(publicUrl.port) : publicUrl.protocol === "https:" ? 443 : 80,
    useSSL: publicUrl.protocol === "https:",
    accessKey: opts.accessKey,
    secretKey: opts.secretKey
  };
  // Presigned S3 signatures include the Host header. Sign directly for the browser-visible
  // endpoint; replacing an internally-signed URL's hostname afterwards invalidates SigV4.
  const signingClient = opts.signingClientFactory
    ? opts.signingClientFactory(signingOptions)
    : new MinioClient(signingOptions);
  return {
    async issue(bucket, objectKey) {
      const expiresInSeconds = 15 * 60;
      if (!(await managementClient.bucketExists(bucket))) await managementClient.makeBucket(bucket);
      const signed = await signingClient.presignedPutObject(bucket, objectKey, expiresInSeconds);
      return { url: signed, expiresAt: new Date(Date.now() + expiresInSeconds * 1_000) };
    }
  };
}

export interface MinioProvisionerOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  clientFactory?: (cfg: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
  }) => MinioLike;
}

export function createMinioObjectStorageProvisioner(opts: MinioProvisionerOptions): ObjectStorageProvisioner {
  const client: MinioLike = opts.clientFactory
    ? opts.clientFactory(opts)
    : (new MinioClient({
        endPoint: opts.endPoint,
        port: opts.port,
        useSSL: opts.useSSL,
        accessKey: opts.accessKey,
        secretKey: opts.secretKey
      }) as unknown as MinioLike);

  return {
    async provisionBucket(slug: string) {
      const bucket = bucketNameFor(slug);
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
      }
      // MVP: dev+prod share one MinIO; return root creds. Stored only in the encrypted
      // ProjectSecretStore by the orchestrator; never surfaced to the Creator.
      return { bucket, accessKey: opts.accessKey, secretKey: opts.secretKey };
    },
    async releaseBucket(slug: string) {
      const bucket = bucketNameFor(slug);
      const exists = await client.bucketExists(bucket);
      if (exists) {
        await client.removeBucket(bucket);
      }
    }
  };
}
