import { createHash, createHmac } from "node:crypto";
import { Client as MinioClient } from "minio";
import type { DockerEngine } from "./docker-engine";
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
  identityAdmin?: MinioIdentityAdmin;
}

export interface MinioIdentityAdmin {
  provision(input: {
    bucket: string;
    accessKey: string;
    secretKey: string;
    policyName: string;
  }): Promise<void>;
  release(input: { bucket: string; accessKey: string; policyName: string }): Promise<void>;
}

function identityFor(slug: string) {
  const suffix = createHash("sha256").update(slug).digest("hex").slice(0, 16);
  return { accessKey: `evcp-${suffix}`, policyName: `evcp-${suffix}` };
}

export function createDockerMinioIdentityAdmin(
  docker: DockerEngine,
  config:
    | string
    | {
        containerName?: string;
        adminAccessKey: string;
        adminSecretKey: string;
      } = "evcp-minio"
): MinioIdentityAdmin {
  const containerName =
    typeof config === "string" ? config : (config.containerName ?? "evcp-minio");
  const alias = typeof config === "string" ? "local" : "evcp-admin";
  const aliasPrefix =
    typeof config === "string"
      ? ""
      : `mc alias set ${alias} http://127.0.0.1:9000 $(printf %s ${Buffer.from(config.adminAccessKey).toString("base64")} | base64 -d) $(printf %s ${Buffer.from(config.adminSecretKey).toString("base64")} | base64 -d) >/dev/null && `;
  const exec = async (script: string) => {
    const container = await docker.inspectContainer(containerName);
    if (!container?.running) throw new Error(`MinIO container '${containerName}' is not running`);
    const result = await docker.execInContainer(container.containerId, [
      "sh",
      "-c",
      `${aliasPrefix}${script}`
    ]);
    if (result.exitCode !== 0)
      throw new Error(`MinIO identity command failed: ${result.stderr.trim()}`);
  };
  return {
    async provision({ bucket, accessKey, secretKey, policyName }) {
      const policy = Buffer.from(
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:GetBucketLocation", "s3:ListBucket"],
              Resource: [`arn:aws:s3:::${bucket}`]
            },
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
              Resource: [`arn:aws:s3:::${bucket}/*`]
            }
          ]
        })
      ).toString("base64");
      const file = `/tmp/${policyName}.json`;
      try {
        await exec(
          `mc admin policy detach ${alias} ${policyName} --user ${accessKey} >/dev/null 2>&1 || true; mc admin user remove ${alias} ${accessKey} >/dev/null 2>&1 || true; mc admin policy remove ${alias} ${policyName} >/dev/null 2>&1 || true; printf %s ${policy} | base64 -d > ${file} && mc admin user add ${alias} ${accessKey} ${secretKey} && mc admin policy create ${alias} ${policyName} ${file} && mc admin policy attach ${alias} ${policyName} --user ${accessKey} && rm -f ${file}`
        );
      } catch (error) {
        await exec(
          `rm -f ${file}; mc admin user remove ${alias} ${accessKey} >/dev/null 2>&1 || true; mc admin policy remove ${alias} ${policyName} >/dev/null 2>&1 || true`
        ).catch(() => {});
        throw error;
      }
    },
    async release({ accessKey, policyName }) {
      await exec(
        `mc admin policy detach ${alias} ${policyName} --user ${accessKey} >/dev/null 2>&1 || true; mc admin user remove ${alias} ${accessKey} >/dev/null 2>&1 || true; mc admin policy remove ${alias} ${policyName} >/dev/null 2>&1 || true`
      );
    }
  };
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
      if (!opts.identityAdmin)
        throw new Error("MinIO identity admin is required for scoped project credentials");
      const bucket = bucketNameFor(slug);
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
      }
      const identity = identityFor(slug);
      const secretKey = createHmac("sha256", opts.secretKey)
        .update(`evcp-project-bucket:${slug}`)
        .digest("hex")
        .slice(0, 48);
      try {
        await opts.identityAdmin.provision({ bucket, ...identity, secretKey });
      } catch (error) {
        if (!exists) await client.removeBucket(bucket).catch(() => {});
        throw error;
      }
      return { bucket, accessKey: identity.accessKey, secretKey };
    },
    async releaseBucket(slug: string) {
      const bucket = bucketNameFor(slug);
      const identity = identityFor(slug);
      await opts.identityAdmin?.release({ bucket, ...identity });
      const exists = await client.bucketExists(bucket);
      if (exists) {
        await client.removeBucket(bucket);
      }
    }
  };
}
