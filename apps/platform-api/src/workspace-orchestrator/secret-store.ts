import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

interface StoredSecret {
  name: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  rotatedAt: string | null;
  createdAt: string;
}

export interface ProjectSecretStore {
  put(projectId: string, name: string, value: string): void;
  listNames(projectId: string): string[];
  resolveEnv(projectId: string): Record<string, string>;
  rotate(projectId: string, name: string, value: string): void;
  removeAll(projectId: string): void;
}

export function createProjectSecretStore(opts: { encryptionKeyHex: string }): ProjectSecretStore {
  if (!/^[0-9a-f]{64}$/i.test(opts.encryptionKeyHex)) {
    throw new Error("encryption key must be 32 bytes hex (64 hex chars)");
  }
  const key = Buffer.from(opts.encryptionKeyHex, "hex");
  const byProject = new Map<string, Map<string, StoredSecret>>();

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
      decipher.final(),
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
    put(projectId, name, value) {
      bucketFor(projectId).set(name, {
        name,
        ...encrypt(value),
        rotatedAt: null,
        createdAt: new Date().toISOString(),
      });
    },
    listNames(projectId) {
      return [...bucketFor(projectId).keys()];
    },
    resolveEnv(projectId) {
      const env: Record<string, string> = {};
      for (const secret of bucketFor(projectId).values()) {
        env[secret.name] = decrypt(secret);
      }
      return env;
    },
    rotate(projectId, name, value) {
      const existing = bucketFor(projectId).get(name);
      bucketFor(projectId).set(name, {
        name,
        ...encrypt(value),
        rotatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      });
    },
    removeAll(projectId) {
      byProject.delete(projectId);
    },
  };
}
