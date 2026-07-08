import { randomBytes } from "node:crypto";
import { assertValidProjectSlug } from "./postgres-provisioner";

// The immutable, id-derived key used to name every physical workspace resource (pg schema, MinIO
// bucket, container, volume, preview path). Derived from the project id — NOT the slug — so that
// renaming a project (which changes its slug) never moves or orphans its resources, and so the key
// is stable across environments. `prj_team_time_off` -> `prj-team-time-off` (hyphens are valid in
// every resource-name context; underscores are not, e.g. S3 buckets). Slug stays for public URLs.
export function resourceKeyForProject(projectId: string): string {
  return projectId.replaceAll("_", "-");
}

export function bucketNameFor(slug: string): string {
  assertValidProjectSlug(slug);
  return `proj-${slug}`;
}

export interface ObjectStorageProvisioner {
  provisionBucket(slug: string): Promise<{ bucket: string; accessKey: string; secretKey: string }>;
  releaseBucket(slug: string): Promise<void>;
}

export function createMemoryObjectStorageProvisioner(): ObjectStorageProvisioner & {
  state: { buckets: string[] };
} {
  const state: { buckets: string[] } = { buckets: [] };
  return {
    state,
    async provisionBucket(slug) {
      const bucket = bucketNameFor(slug);
      state.buckets.push(bucket);
      return {
        bucket,
        accessKey: `ak-${slug}-${randomBytes(4).toString("hex")}`,
        secretKey: randomBytes(24).toString("hex")
      };
    },
    async releaseBucket(slug) {
      const bucket = bucketNameFor(slug);
      state.buckets = state.buckets.filter((name) => name !== bucket);
    }
  };
}

interface LlmVirtualKeyInput {
  projectId: string;
  slug: string;
  maxBudgetUsd?: number;
}

export interface LlmGatewayAdmin {
  createVirtualKey(input: LlmVirtualKeyInput): Promise<{ keyId: string; key: string }>;
  revokeVirtualKey(keyId: string): Promise<void>;
}

export function createMemoryLlmGatewayAdmin(): LlmGatewayAdmin & {
  state: { keys: Array<{ keyId: string; key: string; slug: string; revoked: boolean }> };
} {
  const state: { keys: Array<{ keyId: string; key: string; slug: string; revoked: boolean }> } = {
    keys: []
  };
  return {
    state,
    async createVirtualKey(input) {
      const entry = {
        keyId: `tok_${state.keys.length + 1}`,
        key: `sk-mem-${randomBytes(8).toString("hex")}`,
        slug: input.slug,
        revoked: false
      };
      state.keys.push(entry);
      return { keyId: entry.keyId, key: entry.key };
    },
    async revokeVirtualKey(keyId) {
      const entry = state.keys.find((item) => item.keyId === keyId);
      if (entry) {
        entry.revoked = true;
      }
    }
  };
}

export function createLiteLlmGatewayAdmin(opts: {
  baseUrl: string;
  masterKey: string;
  fetchImpl?: typeof fetch;
}): LlmGatewayAdmin {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${opts.masterKey}`,
    "Content-Type": "application/json"
  };
  return {
    async createVirtualKey(input) {
      const response = await fetchImpl(`${opts.baseUrl}/key/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          key_alias: bucketNameFor(input.slug),
          max_budget: input.maxBudgetUsd,
          metadata: { evcpProjectId: input.projectId }
        })
      });
      if (!response.ok) {
        throw new Error(`litellm key generation failed (${response.status})`);
      }
      const payload = (await response.json()) as { key: string; token_id: string };
      return { keyId: payload.token_id, key: payload.key };
    },
    async revokeVirtualKey(keyId) {
      const response = await fetchImpl(`${opts.baseUrl}/key/delete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ keys: [keyId] })
      });
      if (!response.ok) {
        throw new Error(`litellm key revoke failed (${response.status})`);
      }
    }
  };
}
