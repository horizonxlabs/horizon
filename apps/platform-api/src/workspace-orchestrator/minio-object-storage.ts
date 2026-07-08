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
