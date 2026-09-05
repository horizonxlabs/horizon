import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretPersistence } from "./secret-persistence";

interface StoredSecret {
  name: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  rotatedAt: string | null;
  createdAt: string;
  provisioningToken?: string | null;
}

export interface ProvisioningSecretAttempt {
  token: string;
  assertOwned(): Promise<void>;
}

export interface ProjectSecretStore {
  put(projectId: string, name: string, value: string): Promise<void>;
  listNames(projectId: string): Promise<string[]>;
  resolveEnv(projectId: string): Promise<Record<string, string>>;
  rotate(projectId: string, name: string, value: string): Promise<void>;
  removeAll(projectId: string): Promise<void>;
  replaceForProvisioning(
    projectId: string,
    env: Record<string, string>,
    attempt: ProvisioningSecretAttempt
  ): Promise<void>;
  removeProvisioning(projectId: string, token: string): Promise<void>;
  /** Load persisted (encrypted) secrets from the at-rest store into memory. Awaited at startup. */
  hydrate(): Promise<void>;
}

export function createProjectSecretStore(opts: {
  encryptionKeyHex: string;
  persistence?: SecretPersistence;
}): ProjectSecretStore {
  if (!/^[0-9a-f]{64}$/i.test(opts.encryptionKeyHex)) {
    throw new Error("encryption key must be 32 bytes hex (64 hex chars)");
  }
  const key = Buffer.from(opts.encryptionKeyHex, "hex");
  const persistence = opts.persistence;
  const byProject = new Map<string, Map<string, StoredSecret>>();

  const persist = async (projectId: string, secret: StoredSecret) => {
    await persistence?.upsert({ projectId, ...secret });
  };

  const encrypt = (value: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64")
    };
  };

  const decrypt = (secret: StoredSecret) => {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  };

  const bucketFor = (projectId: string) => {
    let bucket = byProject.get(projectId);
    if (!bucket) {
      bucket = new Map();
      byProject.set(projectId, bucket);
    }
    return bucket;
  };

  return {
    async put(projectId, name, value) {
      const secret: StoredSecret = {
        name,
        ...encrypt(value),
        rotatedAt: null,
        createdAt: new Date().toISOString()
      };
      await persist(projectId, secret);
      bucketFor(projectId).set(name, secret);
    },
    async listNames(projectId) {
      return [...bucketFor(projectId).keys()];
    },
    async resolveEnv(projectId) {
      const env: Record<string, string> = {};
      for (const secret of bucketFor(projectId).values()) {
        env[secret.name] = decrypt(secret);
      }
      return env;
    },
    async rotate(projectId, name, value) {
      const existing = bucketFor(projectId).get(name);
      const secret: StoredSecret = {
        name,
        ...encrypt(value),
        rotatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt ?? new Date().toISOString()
      };
      await persist(projectId, secret);
      bucketFor(projectId).set(name, secret);
    },
    async removeAll(projectId) {
      await persistence?.deleteAll(projectId);
      byProject.delete(projectId);
    },
    async replaceForProvisioning(projectId, env, attempt) {
      await attempt.assertOwned();
      const rows = Object.entries(env).map(([name, value]) => ({
        projectId,
        name,
        ...encrypt(value),
        rotatedAt: null,
        createdAt: new Date().toISOString(),
        provisioningToken: attempt.token
      }));
      if (persistence) {
        if (!persistence.replaceProvisioning)
          throw new Error("secret persistence does not support provisioning attempts");
        if (!(await persistence.replaceProvisioning(projectId, attempt.token, rows))) {
          throw new Error("workspace provisioning lease is no longer owned");
        }
      }
      // A delayed transaction response must not restore stale values in the local cache.
      await attempt.assertOwned();
      for (const row of rows) bucketFor(projectId).set(row.name, row);
    },
    async removeProvisioning(projectId, token) {
      if (persistence) {
        if (!persistence.deleteProvisioning)
          throw new Error("secret persistence does not support provisioning attempts");
        await persistence.deleteProvisioning(projectId, token);
      }
      const bucket = bucketFor(projectId);
      for (const [name, secret] of bucket) {
        if (secret.provisioningToken === token) bucket.delete(name);
      }
    },
    async hydrate() {
      if (!persistence) return;
      try {
        for (const row of await persistence.loadAll()) {
          bucketFor(row.projectId).set(row.name, {
            name: row.name,
            ciphertext: row.ciphertext,
            iv: row.iv,
            authTag: row.authTag,
            rotatedAt: row.rotatedAt,
            createdAt: row.createdAt,
            provisioningToken: row.provisioningToken
          });
        }
      } catch (error) {
        console.warn("[secret-store] hydrate failed:", error);
      }
    }
  };
}
