import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretPersistence } from "./secret-persistence";
import { MANAGED_WORKSPACE_SECRET_NAMES } from "./workspace-lifecycle";

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
  adoptProvisioning(projectId: string, attempt: ProvisioningSecretAttempt): Promise<void>;
  repairForProvisioning(
    projectId: string,
    env: Record<string, string>,
    attempt: ProvisioningSecretAttempt
  ): Promise<void>;
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
  const revisions = new Map<string, number>();
  const nameRevisions = new Map<string, Map<string, number>>();
  const deletionRevisions = new Map<string, number>();
  const beginMutation = (projectId: string, names: string[] = []) => {
    const revision = (revisions.get(projectId) ?? 0) + 1;
    revisions.set(projectId, revision);
    const namesForProject = nameRevisions.get(projectId) ?? new Map<string, number>();
    for (const name of names) namesForProject.set(name, revision);
    nameRevisions.set(projectId, namesForProject);
    return revision;
  };
  const mayWrite = (projectId: string, name: string, revision: number) =>
    (nameRevisions.get(projectId)?.get(name) ?? 0) <= revision &&
    (deletionRevisions.get(projectId) ?? 0) <= revision;
  const refreshProject = async (projectId: string) => {
    if (!persistence) return;
    while (true) {
      const revision = revisions.get(projectId) ?? 0;
      const rows = (await persistence.loadAll()).filter((row) => row.projectId === projectId);
      if ((revisions.get(projectId) ?? 0) !== revision) continue;
      byProject.set(projectId, new Map(rows.map((row) => [row.name, row])));
      revisions.set(projectId, revision + 1);
      return;
    }
  };
  const updateCache = async (projectId: string, revision: number, apply: () => void) => {
    // A later mutation may have completed while this database response was suspended.
    if (persistence && revisions.get(projectId) !== revision) await refreshProject(projectId);
    else {
      apply();
      revisions.set(projectId, (revisions.get(projectId) ?? 0) + 1);
    }
  };

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
      const revision = beginMutation(projectId, [name]);
      const secret: StoredSecret = {
        name,
        ...encrypt(value),
        rotatedAt: null,
        createdAt: new Date().toISOString()
      };
      await persist(projectId, secret);
      await updateCache(projectId, revision, () => {
        if (mayWrite(projectId, name, revision)) bucketFor(projectId).set(name, secret);
      });
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
      const revision = beginMutation(projectId, [name]);
      const existing = bucketFor(projectId).get(name);
      const secret: StoredSecret = {
        name,
        ...encrypt(value),
        rotatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt ?? new Date().toISOString()
      };
      await persist(projectId, secret);
      await updateCache(projectId, revision, () => {
        if (mayWrite(projectId, name, revision)) bucketFor(projectId).set(name, secret);
      });
    },
    async removeAll(projectId) {
      const revision = beginMutation(projectId);
      deletionRevisions.set(projectId, revision);
      await persistence?.deleteAll(projectId);
      await updateCache(projectId, revision, () => {
        for (const name of bucketFor(projectId).keys()) {
          if ((nameRevisions.get(projectId)?.get(name) ?? 0) <= revision)
            bucketFor(projectId).delete(name);
        }
      });
    },
    async replaceForProvisioning(projectId, env, attempt) {
      await attempt.assertOwned();
      const revision = beginMutation(projectId, Object.keys(env));
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
      await updateCache(projectId, revision, () => {
        for (const row of rows) {
          if (mayWrite(projectId, row.name, revision)) bucketFor(projectId).set(row.name, row);
        }
      });
    },
    async repairForProvisioning(projectId, env, attempt) {
      await attempt.assertOwned();
      await refreshProject(projectId);
      const names = [...MANAGED_WORKSPACE_SECRET_NAMES];
      if (
        names.some((name) => !env[name]) ||
        Object.keys(env).some((name) => !MANAGED_WORKSPACE_SECRET_NAMES.has(name))
      )
        throw new Error("managed secret repair requires a complete verified bundle");
      const bucket = bucketFor(projectId);
      if (names.every((name) => bucket.has(name) && decrypt(bucket.get(name)!))) {
        await attempt.assertOwned();
        return;
      }
      const expected = names.flatMap((name) =>
        bucket.has(name) ? [{ projectId, ...bucket.get(name)! }] : []
      );
      if (expected.some((row) => decrypt(row) !== env[row.name]))
        throw new Error("partial managed secrets require reconciliation");
      const revision = beginMutation(
        projectId,
        names.filter((name) => !bucket.has(name))
      );
      const rows = names.map((name) => ({
        projectId,
        name,
        ...encrypt(env[name]),
        rotatedAt: null,
        createdAt: new Date().toISOString(),
        provisioningToken: attempt.token
      }));
      if (persistence) {
        if (
          !persistence.repairProvisioning ||
          !(await persistence.repairProvisioning(projectId, attempt.token, rows, expected))
        )
          throw new Error("managed secret repair lost ownership or changed concurrently");
        await attempt.assertOwned();
        await refreshProject(projectId);
      } else {
        await attempt.assertOwned();
        if (revisions.get(projectId) !== revision)
          throw new Error("managed secrets changed during repair");
        for (const row of rows) if (!bucket.has(row.name)) bucket.set(row.name, row);
        revisions.set(projectId, revision + 1);
      }
      if (
        !names.every(
          (name) => bucketFor(projectId).has(name) && decrypt(bucketFor(projectId).get(name)!)
        )
      )
        throw new Error("managed secret repair is incomplete");
    },
    async adoptProvisioning(projectId, attempt) {
      await attempt.assertOwned();
      beginMutation(projectId);
      if (persistence) {
        if (!persistence.adoptProvisioning)
          throw new Error("secret persistence does not support provisioning adoption");
        if (
          !(await persistence.adoptProvisioning(projectId, attempt.token, [
            ...MANAGED_WORKSPACE_SECRET_NAMES
          ]))
        ) {
          throw new Error("workspace provisioning lease is no longer owned");
        }
        await attempt.assertOwned();
        await refreshProject(projectId);
      } else {
        for (const secret of bucketFor(projectId).values()) {
          if (MANAGED_WORKSPACE_SECRET_NAMES.has(secret.name))
            secret.provisioningToken = attempt.token;
        }
      }
    },
    async removeProvisioning(projectId, token) {
      const revision = beginMutation(projectId);
      if (persistence) {
        if (!persistence.deleteProvisioning)
          throw new Error("secret persistence does not support provisioning attempts");
        await persistence.deleteProvisioning(projectId, token);
      }
      await updateCache(projectId, revision, () => {
        const bucket = bucketFor(projectId);
        for (const [name, secret] of bucket) {
          if (secret.provisioningToken === token) bucket.delete(name);
        }
      });
    },
    async hydrate() {
      if (!persistence) return;
      const observed = new Map(revisions);
      try {
        const rows = await persistence.loadAll();
        const projects = new Set([...byProject.keys(), ...rows.map((row) => row.projectId)]);
        for (const projectId of projects) {
          if ((revisions.get(projectId) ?? 0) !== (observed.get(projectId) ?? 0)) {
            await refreshProject(projectId);
          } else {
            byProject.set(
              projectId,
              new Map(
                rows.filter((row) => row.projectId === projectId).map((row) => [row.name, row])
              )
            );
            revisions.set(projectId, (revisions.get(projectId) ?? 0) + 1);
          }
        }
      } catch (error) {
        console.warn("[secret-store] hydrate failed:", error);
      }
    }
  };
}
