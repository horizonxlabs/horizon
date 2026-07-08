# MVP Plan 1: Workspace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision real per-project workspaces — Postgres schema, MinIO bucket, LiteLLM virtual key, secrets, Docker dev container — with an auth-checked preview proxy, per spec `docs/superpowers/specs/2026-07-06-enterprise-vibe-mvp-design.md` sections 3-4.

**Architecture:** New `workspace-orchestrator` module inside `apps/platform-api` following the repo's existing port/adapter pattern (interface + `Memory*` fake for tests + real implementation). Pure functions build SQL/container specs; an orchestrator composes provisioning steps atomically with rollback. LiteLLM joins docker-compose as the multi-provider gateway.

**Tech Stack:** TypeScript, Node 22+ (`node --import tsx --test` with `.mjs` tests), dockerode (Docker Engine API), LiteLLM (compose service), Postgres 16, MinIO, existing `@evcp/types` + platform-api service pattern.

## Global Constraints

- Tests are `.mjs` files under `tests/unit|integration/e2e`, run via `node --import tsx --test` (see `package.json` scripts); import TS sources with `await import("../../apps/platform-api/src/....ts")`.
- Follow the existing adapter pattern: interface + `Memory...` fake + real impl (see `apps/platform-api/src/persistence/core-repositories.ts`).
- Containers must NEVER publish ports to the host; all access is via the internal compose network `evcp-internal`.
- Secrets are never returned by any API response and never written to git; API may return secret **names** only.
- Every state-changing orchestrator operation writes an audit event via the existing audit service.
- Default dev container limits: CPU 1 core, RAM 2GB (configurable via env `EVCP_WORKSPACE_CPU`, `EVCP_WORKSPACE_MEM_MB`).
- Idle timeout: 30 minutes without activity → container stopped (state `idle`).
- Naming: Postgres schema `app_{slug}` with role `app_{slug}_role`; MinIO bucket `proj-{slug}`; container `evcp-ws-{slug}`; slugs are `[a-z0-9-]{3,40}`.
- `pnpm typecheck && pnpm test:unit` must pass after every task.

---

### Task 1: Workspace domain types + lifecycle state machine

**Files:**

- Modify: `packages/types/src/index.ts` (append)
- Create: `apps/platform-api/src/workspace-orchestrator/state.ts`
- Test: `tests/unit/workspace-orchestrator-state.test.mjs`

**Interfaces:**

- Consumes: nothing new.
- Produces: types `WorkspaceState`, `WorkspaceContainerRecord`, `ProjectResourceRecord`, `ProjectSecretRecord`, `EnvironmentName`; function `canTransition(from: WorkspaceState, to: WorkspaceState): boolean`; function `assertTransition(from, to): void` (throws `WorkspaceStateError`).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-orchestrator-state.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { canTransition, assertTransition, WorkspaceStateError } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/state.ts"
);

test("allows the documented lifecycle transitions", () => {
  assert.equal(canTransition("provisioning", "running"), true);
  assert.equal(canTransition("provisioning", "failed"), true);
  assert.equal(canTransition("running", "idle"), true);
  assert.equal(canTransition("idle", "running"), true);
  assert.equal(canTransition("running", "archived"), true);
  assert.equal(canTransition("idle", "archived"), true);
});

test("rejects undocumented transitions", () => {
  assert.equal(canTransition("archived", "running"), false);
  assert.equal(canTransition("failed", "idle"), false);
  assert.equal(canTransition("idle", "provisioning"), false);
});

test("assertTransition throws WorkspaceStateError with both states in message", () => {
  assert.throws(
    () => assertTransition("archived", "running"),
    (err) =>
      err instanceof WorkspaceStateError &&
      /archived/.test(err.message) &&
      /running/.test(err.message)
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-orchestrator-state.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Add shared types to `packages/types/src/index.ts` (append at end)**

```ts
// --- MVP Plan 1: Workspace Foundation ---

export type WorkspaceState = "provisioning" | "running" | "idle" | "archived" | "failed";

export type EnvironmentName = "dev" | "staging" | "production";

export interface WorkspaceContainerRecord {
  id: string;
  projectId: string;
  slug: string;
  state: WorkspaceState;
  containerId: string | null;
  cpuCores: number;
  memoryMb: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectResourceType = "pg_schema" | "s3_bucket" | "llm_key";

export interface ProjectResourceRecord {
  id: string;
  projectId: string;
  type: ProjectResourceType;
  identifier: string;
  status: "active" | "released";
  createdAt: string;
}

export interface ProjectSecretRecord {
  id: string;
  projectId: string;
  name: string;
  encryptedValue: string;
  rotatedAt: string | null;
  createdAt: string;
}

export interface EnvironmentRecord {
  id: string;
  projectId: string;
  name: EnvironmentName;
  routePath: string;
  status: "active" | "disabled";
}
```

- [ ] **Step 4: Write `apps/platform-api/src/workspace-orchestrator/state.ts`**

```ts
import type { WorkspaceState } from "@evcp/types";

export class WorkspaceStateError extends Error {}

const TRANSITIONS: Record<WorkspaceState, WorkspaceState[]> = {
  provisioning: ["running", "failed"],
  running: ["idle", "archived", "failed"],
  idle: ["running", "archived"],
  archived: [],
  failed: []
};

export function canTransition(from: WorkspaceState, to: WorkspaceState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: WorkspaceState, to: WorkspaceState): void {
  if (!canTransition(from, to)) {
    throw new WorkspaceStateError(`invalid workspace transition from '${from}' to '${to}'`);
  }
}
```

- [ ] **Step 5: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-orchestrator-state.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/index.ts apps/platform-api/src/workspace-orchestrator/state.ts tests/unit/workspace-orchestrator-state.test.mjs
git commit -m "feat(workspace): add workspace domain types and lifecycle state machine"
```

---

### Task 2: Slug validation + Postgres provisioning SQL builder

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts`
- Test: `tests/unit/workspace-postgres-provisioner.test.mjs`

**Interfaces:**

- Consumes: nothing new.
- Produces: `assertValidProjectSlug(slug: string): void` (throws `ValidationError`-style `Error`), `buildProvisionSchemaSql(slug: string, password: string): string[]`, `buildReleaseSchemaSql(slug: string): string[]`, `schemaNameFor(slug): string`, `roleNameFor(slug): string`, and interface `PostgresProvisioner { provisionSchema(slug): Promise<{ schemaName: string; roleName: string; password: string }>; releaseSchema(slug): Promise<void>; }` plus `createPgClientPostgresProvisioner(runSql: (sql: string) => Promise<void>): PostgresProvisioner`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-postgres-provisioner.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const {
  assertValidProjectSlug,
  buildProvisionSchemaSql,
  buildReleaseSchemaSql,
  schemaNameFor,
  roleNameFor,
  createPgClientPostgresProvisioner
} = await import("../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts");

test("accepts valid slugs and rejects invalid ones", () => {
  assertValidProjectSlug("leave-tracker-01");
  for (const bad of ["ab", "UPPER", "has_underscore", "a".repeat(41), "semi;colon", "sp ace", ""]) {
    assert.throws(
      () => assertValidProjectSlug(bad),
      /slug/i,
      `expected rejection for ${JSON.stringify(bad)}`
    );
  }
});

test("builds schema/role names deterministically", () => {
  assert.equal(schemaNameFor("leave-tracker"), "app_leave_tracker");
  assert.equal(roleNameFor("leave-tracker"), "app_leave_tracker_role");
});

test("provision SQL creates isolated role and schema, revoking public access", () => {
  const sql = buildProvisionSchemaSql("leave-tracker", "s3cret").join("\n");
  assert.match(sql, /CREATE ROLE "app_leave_tracker_role" LOGIN PASSWORD 's3cret'/);
  assert.match(sql, /CREATE SCHEMA "app_leave_tracker" AUTHORIZATION "app_leave_tracker_role"/);
  assert.match(sql, /REVOKE ALL ON SCHEMA public FROM "app_leave_tracker_role"/);
  assert.match(sql, /ALTER ROLE "app_leave_tracker_role" SET search_path = "app_leave_tracker"/);
});

test("release SQL drops schema and role", () => {
  const sql = buildReleaseSchemaSql("leave-tracker").join("\n");
  assert.match(sql, /DROP SCHEMA IF EXISTS "app_leave_tracker" CASCADE/);
  assert.match(sql, /DROP ROLE IF EXISTS "app_leave_tracker_role"/);
});

test("pg-client provisioner runs all statements and returns credentials", async () => {
  const executed = [];
  const provisioner = createPgClientPostgresProvisioner(async (sql) => {
    executed.push(sql);
  });
  const result = await provisioner.provisionSchema("leave-tracker");
  assert.equal(result.schemaName, "app_leave_tracker");
  assert.equal(result.roleName, "app_leave_tracker_role");
  assert.equal(typeof result.password, "string");
  assert.ok(result.password.length >= 32);
  assert.ok(executed.length >= 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-postgres-provisioner.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts`**

```ts
import { randomBytes } from "node:crypto";

const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;

export function assertValidProjectSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`invalid project slug '${slug}': must match [a-z0-9-]{3,40}`);
  }
}

export function schemaNameFor(slug: string): string {
  assertValidProjectSlug(slug);
  return `app_${slug.replaceAll("-", "_")}`;
}

export function roleNameFor(slug: string): string {
  return `${schemaNameFor(slug)}_role`;
}

export function buildProvisionSchemaSql(slug: string, password: string): string[] {
  const schema = schemaNameFor(slug);
  const role = roleNameFor(slug);
  if (password.includes("'")) {
    throw new Error("generated password must not contain quotes");
  }
  return [
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`,
    `CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`,
    `REVOKE ALL ON SCHEMA public FROM "${role}"`,
    `ALTER ROLE "${role}" SET search_path = "${schema}"`
  ];
}

export function buildReleaseSchemaSql(slug: string): string[] {
  const schema = schemaNameFor(slug);
  const role = roleNameFor(slug);
  return [`DROP SCHEMA IF EXISTS "${schema}" CASCADE`, `DROP ROLE IF EXISTS "${role}"`];
}

export interface PostgresProvisioner {
  provisionSchema(
    slug: string
  ): Promise<{ schemaName: string; roleName: string; password: string }>;
  releaseSchema(slug: string): Promise<void>;
}

export function createPgClientPostgresProvisioner(
  runSql: (sql: string) => Promise<void>
): PostgresProvisioner {
  return {
    async provisionSchema(slug) {
      const password = randomBytes(24).toString("hex");
      for (const statement of buildProvisionSchemaSql(slug, password)) {
        await runSql(statement);
      }
      return { schemaName: schemaNameFor(slug), roleName: roleNameFor(slug), password };
    },
    async releaseSchema(slug) {
      for (const statement of buildReleaseSchemaSql(slug)) {
        await runSql(statement);
      }
    }
  };
}
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-postgres-provisioner.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts tests/unit/workspace-postgres-provisioner.test.mjs
git commit -m "feat(workspace): add postgres schema provisioner with isolated role"
```

---

### Task 3: Object storage (MinIO) + LiteLLM virtual key provisioner ports

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/resource-ports.ts`
- Test: `tests/unit/workspace-resource-ports.test.mjs`

**Interfaces:**

- Consumes: `assertValidProjectSlug` from Task 2.
- Produces:
  - `bucketNameFor(slug): string`
  - `interface ObjectStorageProvisioner { provisionBucket(slug): Promise<{ bucket: string; accessKey: string; secretKey: string }>; releaseBucket(slug): Promise<void>; }`
  - `interface LlmGatewayAdmin { createVirtualKey(input: { projectId: string; slug: string; maxBudgetUsd?: number }): Promise<{ keyId: string; key: string }>; revokeVirtualKey(keyId: string): Promise<void>; }`
  - `createMemoryObjectStorageProvisioner()`, `createMemoryLlmGatewayAdmin()` fakes (each also exposes `.state` for test inspection)
  - `createLiteLlmGatewayAdmin(opts: { baseUrl: string; masterKey: string; fetchImpl?: typeof fetch })` — real HTTP impl of `LlmGatewayAdmin` calling LiteLLM `/key/generate` and `/key/delete`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-resource-ports.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const {
  bucketNameFor,
  createMemoryObjectStorageProvisioner,
  createMemoryLlmGatewayAdmin,
  createLiteLlmGatewayAdmin
} = await import("../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts");

test("bucket naming follows proj-{slug}", () => {
  assert.equal(bucketNameFor("leave-tracker"), "proj-leave-tracker");
  assert.throws(() => bucketNameFor("BAD SLUG"));
});

test("memory object storage provisions and releases buckets", async () => {
  const storage = createMemoryObjectStorageProvisioner();
  const created = await storage.provisionBucket("leave-tracker");
  assert.equal(created.bucket, "proj-leave-tracker");
  assert.ok(created.accessKey.length > 0);
  assert.ok(created.secretKey.length >= 32);
  assert.deepEqual(storage.state.buckets, ["proj-leave-tracker"]);
  await storage.releaseBucket("leave-tracker");
  assert.deepEqual(storage.state.buckets, []);
});

test("memory llm gateway issues and revokes virtual keys", async () => {
  const gateway = createMemoryLlmGatewayAdmin();
  const issued = await gateway.createVirtualKey({
    projectId: "p1",
    slug: "leave-tracker",
    maxBudgetUsd: 25
  });
  assert.match(issued.key, /^sk-/);
  assert.equal(gateway.state.keys.length, 1);
  await gateway.revokeVirtualKey(issued.keyId);
  assert.equal(gateway.state.keys[0].revoked, true);
});

test("litellm admin client calls /key/generate with master key auth", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ key: "sk-litellm-abc", token_id: "tok_1" }), {
      status: 200
    });
  };
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "sk-master",
    fetchImpl: fakeFetch
  });
  const issued = await gateway.createVirtualKey({
    projectId: "p1",
    slug: "leave-tracker",
    maxBudgetUsd: 25
  });
  assert.equal(issued.key, "sk-litellm-abc");
  assert.equal(issued.keyId, "tok_1");
  assert.equal(calls[0].url, "http://litellm:4000/key/generate");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-master");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.key_alias, "proj-leave-tracker");
  assert.equal(body.max_budget, 25);
  assert.deepEqual(body.metadata, { evcpProjectId: "p1" });
});

test("litellm admin client surfaces non-200 as error", async () => {
  const gateway = createLiteLlmGatewayAdmin({
    baseUrl: "http://litellm:4000",
    masterKey: "sk-master",
    fetchImpl: async () => new Response("nope", { status: 401 })
  });
  await assert.rejects(
    () => gateway.createVirtualKey({ projectId: "p1", slug: "leave-tracker" }),
    /litellm key generation failed \(401\)/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-resource-ports.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/resource-ports.ts`**

```ts
import { randomBytes } from "node:crypto";
import { assertValidProjectSlug } from "./postgres-provisioner";

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
  const state = { buckets: [] as string[] };
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

export interface LlmVirtualKeyInput {
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
  const state = {
    keys: [] as Array<{ keyId: string; key: string; slug: string; revoked: boolean }>
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
        body: JSON.stringify({ key_aliases: undefined, keys: [keyId] })
      });
      if (!response.ok) {
        throw new Error(`litellm key revoke failed (${response.status})`);
      }
    }
  };
}
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-resource-ports.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/resource-ports.ts tests/unit/workspace-resource-ports.test.mjs
git commit -m "feat(workspace): add object storage and litellm virtual key provisioner ports"
```

---

### Task 4: Encrypted project secret store (names-only listing)

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/secret-store.ts`
- Test: `tests/unit/workspace-secret-store.test.mjs`

**Interfaces:**

- Consumes: `ProjectSecretRecord` type from Task 1.
- Produces: `createProjectSecretStore(opts: { encryptionKeyHex: string })` returning `{ put(projectId, name, value): void; listNames(projectId): string[]; resolveEnv(projectId): Record<string, string>; rotate(projectId, name, value): void; removeAll(projectId): void }`. `resolveEnv` is the ONLY way plaintext leaves the store (used for container env injection). AES-256-GCM.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-secret-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createProjectSecretStore } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts"
);

const keyHex = randomBytes(32).toString("hex");

test("stores secrets encrypted and lists names only", () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  store.put("p1", "DATABASE_URL", "postgresql://app:pw@postgres/evcp?schema=app_x");
  store.put("p1", "S3_SECRET_KEY", "super-secret");
  assert.deepEqual(store.listNames("p1").sort(), ["DATABASE_URL", "S3_SECRET_KEY"]);
  const dump = JSON.stringify(store);
  assert.ok(!dump.includes("super-secret"), "plaintext must not appear in store state");
});

test("resolveEnv round-trips plaintext for container injection", () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  store.put("p1", "DATABASE_URL", "postgresql://x");
  assert.deepEqual(store.resolveEnv("p1"), { DATABASE_URL: "postgresql://x" });
});

test("rotate replaces value and stamps rotatedAt; removeAll clears project", () => {
  const store = createProjectSecretStore({ encryptionKeyHex: keyHex });
  store.put("p1", "S3_SECRET_KEY", "old");
  store.rotate("p1", "S3_SECRET_KEY", "new");
  assert.equal(store.resolveEnv("p1").S3_SECRET_KEY, "new");
  store.removeAll("p1");
  assert.deepEqual(store.listNames("p1"), []);
});

test("rejects invalid encryption key", () => {
  assert.throws(
    () => createProjectSecretStore({ encryptionKeyHex: "too-short" }),
    /encryption key/i
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-secret-store.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/secret-store.ts`**

```ts
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
    put(projectId, name, value) {
      bucketFor(projectId).set(name, {
        name,
        ...encrypt(value),
        rotatedAt: null,
        createdAt: new Date().toISOString()
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
        createdAt: existing?.createdAt ?? new Date().toISOString()
      });
    },
    removeAll(projectId) {
      byProject.delete(projectId);
    }
  };
}
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-secret-store.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/secret-store.ts tests/unit/workspace-secret-store.test.mjs
git commit -m "feat(workspace): add AES-256-GCM project secret store with names-only listing"
```

---

### Task 5: Docker engine port + container spec builder

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/docker-engine.ts`
- Test: `tests/unit/workspace-docker-engine.test.mjs`

**Interfaces:**

- Consumes: `assertValidProjectSlug` (Task 2).
- Produces:
  - `buildDevContainerSpec(input: { slug: string; image: string; env: Record<string, string>; cpuCores: number; memoryMb: number; network: string; workspaceVolume: string }): DevContainerSpec` — pure; output shape `{ name, image, env: string[], hostConfig: { NanoCpus, Memory, NetworkMode, Binds }, labels, exposedPort: 3000, publishPorts: false }`.
  - `interface DockerEngine { createContainer(spec): Promise<{ containerId: string }>; startContainer(id): Promise<void>; stopContainer(id): Promise<void>; removeContainer(id): Promise<void>; }`
  - `createMemoryDockerEngine()` fake with `.state.containers`.
  - Real impl `createDockerodeEngine()` deferred to integration wiring in Task 8 (kept thin; not unit-tested).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-docker-engine.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { buildDevContainerSpec, createMemoryDockerEngine } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

const baseInput = {
  slug: "leave-tracker",
  image: "evcp/workspace-next:1",
  env: { DATABASE_URL: "postgresql://x", S3_BUCKET: "proj-leave-tracker" },
  cpuCores: 1,
  memoryMb: 2048,
  network: "evcp-internal",
  workspaceVolume: "evcp-ws-leave-tracker-data"
};

test("builds a locked-down dev container spec", () => {
  const spec = buildDevContainerSpec(baseInput);
  assert.equal(spec.name, "evcp-ws-leave-tracker");
  assert.equal(spec.publishPorts, false);
  assert.equal(spec.exposedPort, 3000);
  assert.equal(spec.hostConfig.NetworkMode, "evcp-internal");
  assert.equal(spec.hostConfig.NanoCpus, 1_000_000_000);
  assert.equal(spec.hostConfig.Memory, 2048 * 1024 * 1024);
  assert.deepEqual(spec.hostConfig.Binds, ["evcp-ws-leave-tracker-data:/workspace"]);
  assert.ok(spec.env.includes("DATABASE_URL=postgresql://x"));
  assert.equal(spec.labels["evcp.project-slug"], "leave-tracker");
});

test("memory docker engine tracks lifecycle", async () => {
  const engine = createMemoryDockerEngine();
  const spec = buildDevContainerSpec(baseInput);
  const { containerId } = await engine.createContainer(spec);
  await engine.startContainer(containerId);
  assert.equal(engine.state.containers[0].status, "running");
  await engine.stopContainer(containerId);
  assert.equal(engine.state.containers[0].status, "stopped");
  await engine.removeContainer(containerId);
  assert.equal(engine.state.containers.length, 0);
});

test("stopping an unknown container throws", async () => {
  const engine = createMemoryDockerEngine();
  await assert.rejects(() => engine.stopContainer("missing"), /unknown container/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-docker-engine.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/docker-engine.ts`**

```ts
import { assertValidProjectSlug } from "./postgres-provisioner";

export interface DevContainerSpec {
  name: string;
  image: string;
  env: string[];
  hostConfig: {
    NanoCpus: number;
    Memory: number;
    NetworkMode: string;
    Binds: string[];
  };
  labels: Record<string, string>;
  exposedPort: 3000;
  publishPorts: false;
}

export function buildDevContainerSpec(input: {
  slug: string;
  image: string;
  env: Record<string, string>;
  cpuCores: number;
  memoryMb: number;
  network: string;
  workspaceVolume: string;
}): DevContainerSpec {
  assertValidProjectSlug(input.slug);
  return {
    name: `evcp-ws-${input.slug}`,
    image: input.image,
    env: Object.entries(input.env).map(([name, value]) => `${name}=${value}`),
    hostConfig: {
      NanoCpus: Math.round(input.cpuCores * 1_000_000_000),
      Memory: input.memoryMb * 1024 * 1024,
      NetworkMode: input.network,
      Binds: [`${input.workspaceVolume}:/workspace`]
    },
    labels: { "evcp.managed": "true", "evcp.project-slug": input.slug },
    exposedPort: 3000,
    publishPorts: false
  };
}

export interface DockerEngine {
  createContainer(spec: DevContainerSpec): Promise<{ containerId: string }>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
}

interface MemoryContainer {
  containerId: string;
  spec: DevContainerSpec;
  status: "created" | "running" | "stopped";
}

export function createMemoryDockerEngine(): DockerEngine & {
  state: { containers: MemoryContainer[] };
} {
  const state = { containers: [] as MemoryContainer[] };
  const find = (containerId: string) => {
    const container = state.containers.find((item) => item.containerId === containerId);
    if (!container) {
      throw new Error(`unknown container '${containerId}'`);
    }
    return container;
  };
  return {
    state,
    async createContainer(spec) {
      const containerId = `mem-${state.containers.length + 1}-${spec.name}`;
      state.containers.push({ containerId, spec, status: "created" });
      return { containerId };
    },
    async startContainer(containerId) {
      find(containerId).status = "running";
    },
    async stopContainer(containerId) {
      find(containerId).status = "stopped";
    },
    async removeContainer(containerId) {
      find(containerId);
      state.containers = state.containers.filter((item) => item.containerId !== containerId);
    }
  };
}
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-docker-engine.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/docker-engine.ts tests/unit/workspace-docker-engine.test.mjs
git commit -m "feat(workspace): add docker engine port and dev container spec builder"
```

---

### Task 6: Workspace Orchestrator — atomic provisioning with rollback

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`
- Test: `tests/unit/workspace-orchestrator.test.mjs`

**Interfaces:**

- Consumes: `PostgresProvisioner` (Task 2), `ObjectStorageProvisioner` + `LlmGatewayAdmin` (Task 3), `ProjectSecretStore` (Task 4), `DockerEngine` + `buildDevContainerSpec` (Task 5), `assertTransition` (Task 1).
- Produces: `createWorkspaceOrchestrator(deps)` returning:
  - `provisionWorkspace(input: { projectId: string; slug: string }): Promise<WorkspaceContainerRecord>`
  - `stopWorkspace(projectId): Promise<WorkspaceContainerRecord>` (running → idle)
  - `wakeWorkspace(projectId): Promise<WorkspaceContainerRecord>` (idle → running)
  - `archiveWorkspace(projectId): Promise<WorkspaceContainerRecord>`
  - `getWorkspace(projectId): WorkspaceContainerRecord | null`
  - `listSecretNames(projectId): string[]`
  - `markActivity(projectId): void` and `stopIdleWorkspaces(now?: Date): Promise<string[]>` (30-minute idle sweep)
  - `deps` shape: `{ postgres, objectStorage, llmGateway, secrets, docker, image?: string; network?: string; cpuCores?: number; memoryMb?: number; onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void }`
- Secrets written during provisioning (names): `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `LLM_GATEWAY_KEY`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-orchestrator.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts"
);
const { createPgClientPostgresProvisioner } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts"
);
const { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts"
);
const { createProjectSecretStore } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts"
);
const { createMemoryDockerEngine } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

function createDeps(overrides = {}) {
  const executedSql = [];
  const audits = [];
  const deps = {
    postgres: createPgClientPostgresProvisioner(async (sql) => executedSql.push(sql)),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine(),
    onAudit: (event) => audits.push(event),
    ...overrides
  };
  return { deps, executedSql, audits };
}

test("provisionWorkspace creates schema, bucket, llm key, secrets and running container", async () => {
  const { deps, executedSql, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  const record = await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });

  assert.equal(record.state, "running");
  assert.equal(record.slug, "leave-tracker");
  assert.ok(record.containerId);
  assert.ok(executedSql.some((sql) => sql.includes("CREATE SCHEMA")));
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-leave-tracker"]);
  assert.equal(deps.llmGateway.state.keys.length, 1);
  assert.deepEqual(orchestrator.listSecretNames("p1").sort(), [
    "DATABASE_URL",
    "LLM_GATEWAY_KEY",
    "S3_ACCESS_KEY",
    "S3_BUCKET",
    "S3_ENDPOINT",
    "S3_SECRET_KEY"
  ]);
  assert.equal(deps.docker.state.containers[0].status, "running");
  assert.ok(
    deps.docker.state.containers[0].spec.env.some((entry) => entry.startsWith("DATABASE_URL="))
  );
  assert.ok(audits.some((event) => event.action === "workspace.provisioned"));
});

test("provisioning rolls back everything when container start fails", async () => {
  const { deps } = createDeps();
  deps.docker.startContainer = async () => {
    throw new Error("docker daemon exploded");
  };
  const orchestrator = createWorkspaceOrchestrator(deps);
  await assert.rejects(
    () => orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" }),
    /docker daemon exploded/
  );
  assert.deepEqual(deps.objectStorage.state.buckets, [], "bucket must be rolled back");
  assert.equal(deps.llmGateway.state.keys[0].revoked, true, "llm key must be revoked");
  assert.deepEqual(orchestrator.listSecretNames("p1"), [], "secrets must be cleared");
  const record = orchestrator.getWorkspace("p1");
  assert.equal(record.state, "failed");
});

test("duplicate provisioning for same project is rejected", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  await assert.rejects(
    () => orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" }),
    /already provisioned/
  );
});

test("stop/wake cycle follows state machine and audits", async () => {
  const { deps, audits } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const idle = await orchestrator.stopWorkspace("p1");
  assert.equal(idle.state, "idle");
  const awake = await orchestrator.wakeWorkspace("p1");
  assert.equal(awake.state, "running");
  assert.ok(audits.some((event) => event.action === "workspace.stopped"));
  assert.ok(audits.some((event) => event.action === "workspace.started"));
});

test("stopIdleWorkspaces stops containers idle for 30+ minutes", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const future = new Date(Date.now() + 31 * 60 * 1000);
  const stopped = await orchestrator.stopIdleWorkspaces(future);
  assert.deepEqual(stopped, ["p1"]);
  assert.equal(orchestrator.getWorkspace("p1").state, "idle");
});

test("archiveWorkspace stops container but keeps volume resources", async () => {
  const { deps } = createDeps();
  const orchestrator = createWorkspaceOrchestrator(deps);
  await orchestrator.provisionWorkspace({ projectId: "p1", slug: "leave-tracker" });
  const record = await orchestrator.archiveWorkspace("p1");
  assert.equal(record.state, "archived");
  assert.equal(deps.docker.state.containers.length, 0, "container removed");
  assert.deepEqual(deps.objectStorage.state.buckets, ["proj-leave-tracker"], "bucket retained");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-orchestrator.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`**

```ts
import type { WorkspaceContainerRecord } from "@evcp/types";
import { assertTransition } from "./state";
import { schemaNameFor, roleNameFor, type PostgresProvisioner } from "./postgres-provisioner";
import type { ObjectStorageProvisioner, LlmGatewayAdmin } from "./resource-ports";
import type { ProjectSecretStore } from "./secret-store";
import { buildDevContainerSpec, type DockerEngine } from "./docker-engine";

export interface WorkspaceAuditEvent {
  action: string;
  projectId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceOrchestratorDeps {
  postgres: PostgresProvisioner;
  objectStorage: ObjectStorageProvisioner;
  llmGateway: LlmGatewayAdmin;
  secrets: ProjectSecretStore;
  docker: DockerEngine;
  image?: string;
  network?: string;
  cpuCores?: number;
  memoryMb?: number;
  postgresHost?: string;
  s3Endpoint?: string;
  onAudit?: (event: WorkspaceAuditEvent) => void;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function createWorkspaceOrchestrator(deps: WorkspaceOrchestratorDeps) {
  const image = deps.image ?? "evcp/workspace-next:1";
  const network = deps.network ?? "evcp-internal";
  const cpuCores = deps.cpuCores ?? Number(process.env.EVCP_WORKSPACE_CPU ?? 1);
  const memoryMb = deps.memoryMb ?? Number(process.env.EVCP_WORKSPACE_MEM_MB ?? 2048);
  const postgresHost = deps.postgresHost ?? "postgres:5432";
  const s3Endpoint = deps.s3Endpoint ?? "http://minio:9000";
  const audit = (event: WorkspaceAuditEvent) => deps.onAudit?.(event);

  const records = new Map<string, WorkspaceContainerRecord>();
  const llmKeyIds = new Map<string, string>();

  const now = () => new Date().toISOString();

  const save = (record: WorkspaceContainerRecord) => {
    records.set(record.projectId, { ...record, updatedAt: now() });
    return records.get(record.projectId)!;
  };

  const mustGet = (projectId: string) => {
    const record = records.get(projectId);
    if (!record) {
      throw new Error(`no workspace for project '${projectId}'`);
    }
    return record;
  };

  return {
    getWorkspace(projectId: string): WorkspaceContainerRecord | null {
      return records.get(projectId) ?? null;
    },

    listSecretNames(projectId: string): string[] {
      return deps.secrets.listNames(projectId);
    },

    markActivity(projectId: string): void {
      const record = records.get(projectId);
      if (record) {
        save({ ...record, lastActivityAt: now() });
      }
    },

    async provisionWorkspace(input: {
      projectId: string;
      slug: string;
    }): Promise<WorkspaceContainerRecord> {
      const existing = records.get(input.projectId);
      if (existing && existing.state !== "failed") {
        throw new Error(`workspace already provisioned for project '${input.projectId}'`);
      }
      let record: WorkspaceContainerRecord = save({
        id: `ws-${input.slug}`,
        projectId: input.projectId,
        slug: input.slug,
        state: "provisioning",
        containerId: null,
        cpuCores,
        memoryMb,
        lastActivityAt: now(),
        createdAt: now(),
        updatedAt: now()
      });

      const rollbacks: Array<() => Promise<void>> = [];
      try {
        const pg = await deps.postgres.provisionSchema(input.slug);
        rollbacks.push(() => deps.postgres.releaseSchema(input.slug));

        const bucket = await deps.objectStorage.provisionBucket(input.slug);
        rollbacks.push(() => deps.objectStorage.releaseBucket(input.slug));

        const llmKey = await deps.llmGateway.createVirtualKey({
          projectId: input.projectId,
          slug: input.slug
        });
        llmKeyIds.set(input.projectId, llmKey.keyId);
        rollbacks.push(() => deps.llmGateway.revokeVirtualKey(llmKey.keyId));

        deps.secrets.put(
          input.projectId,
          "DATABASE_URL",
          `postgresql://${pg.roleName}:${pg.password}@${postgresHost}/evcp?schema=${pg.schemaName}`
        );
        deps.secrets.put(input.projectId, "S3_ENDPOINT", s3Endpoint);
        deps.secrets.put(input.projectId, "S3_BUCKET", bucket.bucket);
        deps.secrets.put(input.projectId, "S3_ACCESS_KEY", bucket.accessKey);
        deps.secrets.put(input.projectId, "S3_SECRET_KEY", bucket.secretKey);
        deps.secrets.put(input.projectId, "LLM_GATEWAY_KEY", llmKey.key);
        rollbacks.push(async () => deps.secrets.removeAll(input.projectId));

        const spec = buildDevContainerSpec({
          slug: input.slug,
          image,
          env: deps.secrets.resolveEnv(input.projectId),
          cpuCores,
          memoryMb,
          network,
          workspaceVolume: `evcp-ws-${input.slug}-data`
        });
        const { containerId } = await deps.docker.createContainer(spec);
        rollbacks.push(() => deps.docker.removeContainer(containerId));
        await deps.docker.startContainer(containerId);

        assertTransition(record.state, "running");
        record = save({ ...record, state: "running", containerId });
        audit({
          action: "workspace.provisioned",
          projectId: input.projectId,
          metadata: { slug: input.slug }
        });
        return record;
      } catch (error) {
        for (const rollback of rollbacks.reverse()) {
          try {
            await rollback();
          } catch {
            // rollback best-effort; original error wins
          }
        }
        save({ ...record, state: "failed" });
        audit({
          action: "workspace.provision_failed",
          projectId: input.projectId,
          metadata: {
            slug: input.slug,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        throw error;
      }
    },

    async stopWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "idle");
      await deps.docker.stopContainer(record.containerId!);
      const next = save({ ...record, state: "idle" });
      audit({ action: "workspace.stopped", projectId });
      return next;
    },

    async wakeWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "running");
      await deps.docker.startContainer(record.containerId!);
      const next = save({ ...record, state: "running", lastActivityAt: now() });
      audit({ action: "workspace.started", projectId });
      return next;
    },

    async archiveWorkspace(projectId: string): Promise<WorkspaceContainerRecord> {
      const record = mustGet(projectId);
      assertTransition(record.state, "archived");
      if (record.containerId) {
        await deps.docker.stopContainer(record.containerId).catch(() => undefined);
        await deps.docker.removeContainer(record.containerId);
      }
      const next = save({ ...record, state: "archived", containerId: null });
      audit({ action: "workspace.archived", projectId });
      return next;
    },

    async stopIdleWorkspaces(nowDate: Date = new Date()): Promise<string[]> {
      const stopped: string[] = [];
      for (const record of records.values()) {
        if (record.state !== "running") {
          continue;
        }
        const idleMs = nowDate.getTime() - new Date(record.lastActivityAt).getTime();
        if (idleMs >= IDLE_TIMEOUT_MS) {
          await this.stopWorkspace(record.projectId);
          stopped.push(record.projectId);
        }
      }
      return stopped;
    }
  };
}

export type WorkspaceOrchestrator = ReturnType<typeof createWorkspaceOrchestrator>;
export { schemaNameFor, roleNameFor };
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-orchestrator.test.mjs && pnpm typecheck`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/orchestrator.ts tests/unit/workspace-orchestrator.test.mjs
git commit -m "feat(workspace): add orchestrator with atomic provisioning and rollback"
```

---

### Task 7: Golden Next.js template + locked-files manifest

**Files:**

- Create: `templates/nextjs-base/template.json`
- Create: `templates/nextjs-base/package.json`
- Create: `templates/nextjs-base/platform.config.ts`
- Create: `templates/nextjs-base/prisma/schema.prisma`
- Create: `templates/nextjs-base/app/layout.tsx`
- Create: `templates/nextjs-base/app/page.tsx`
- Create: `templates/nextjs-base/lib/storage.ts`
- Create: `apps/platform-api/src/workspace-orchestrator/template.ts`
- Test: `tests/unit/workspace-golden-template.test.mjs`

**Interfaces:**

- Consumes: nothing new.
- Produces: `loadGoldenTemplate(rootDir?: string): GoldenTemplate` where `GoldenTemplate = { name: string; lockedFiles: string[]; files: Array<{ path: string; content: string }> }`; `isLockedFile(template, path): boolean`. Plan 2's action runner will call `isLockedFile` to reject AI writes.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-golden-template.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { loadGoldenTemplate, isLockedFile } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/template.ts"
);

test("loads the nextjs-base template with manifest", () => {
  const template = loadGoldenTemplate();
  assert.equal(template.name, "nextjs-base");
  const paths = template.files.map((file) => file.path);
  for (const required of [
    "package.json",
    "platform.config.ts",
    "prisma/schema.prisma",
    "app/layout.tsx",
    "app/page.tsx",
    "lib/storage.ts"
  ]) {
    assert.ok(paths.includes(required), `missing template file ${required}`);
  }
});

test("locked files include platform config, prisma datasource and storage wiring", () => {
  const template = loadGoldenTemplate();
  assert.ok(isLockedFile(template, "platform.config.ts"));
  assert.ok(isLockedFile(template, "prisma/schema.prisma") === false, "schema models are editable");
  assert.ok(isLockedFile(template, "lib/storage.ts"));
  assert.ok(!isLockedFile(template, "app/page.tsx"));
});

test("template files reference env vars, never literal secrets", () => {
  const template = loadGoldenTemplate();
  const all = template.files.map((file) => file.content).join("\n");
  assert.ok(all.includes("process.env.DATABASE_URL") || all.includes('env("DATABASE_URL")'));
  assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(all), "no literal keys in template");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-golden-template.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Create template files**

`templates/nextjs-base/template.json`:

```json
{
  "name": "nextjs-base",
  "lockedFiles": ["platform.config.ts", "lib/storage.ts", "package.json"]
}
```

`templates/nextjs-base/package.json`:

```json
{
  "name": "evcp-generated-app",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000 --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start --port 3000 --hostname 0.0.0.0"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/node": "^22.0.0"
  }
}
```

`templates/nextjs-base/platform.config.ts`:

```ts
// LOCKED FILE — provisioned by Horizon. Do not edit.
export const platformConfig = {
  databaseUrl: process.env.DATABASE_URL!,
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    bucket: process.env.S3_BUCKET!,
    accessKey: process.env.S3_ACCESS_KEY!,
    secretKey: process.env.S3_SECRET_KEY!
  }
};
```

`templates/nextjs-base/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// AI adds application models below this line.
```

`templates/nextjs-base/app/layout.tsx`:

```tsx
export const metadata = { title: "Generated App" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`templates/nextjs-base/app/page.tsx`:

```tsx
export default function HomePage() {
  return <main>Your app starts here. Ask the AI to build a feature.</main>;
}
```

`templates/nextjs-base/lib/storage.ts`:

```ts
// LOCKED FILE — provisioned object storage client. Do not edit.
import { platformConfig } from "../platform.config";

export function storageConfig() {
  return platformConfig.s3;
}
```

- [ ] **Step 4: Write `apps/platform-api/src/workspace-orchestrator/template.ts`**

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface GoldenTemplate {
  name: string;
  lockedFiles: string[];
  files: Array<{ path: string; content: string }>;
}

function walk(dir: string, root: string, out: Array<{ path: string; content: string }>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, root, out);
    } else {
      out.push({
        path: relative(root, full).replaceAll("\\", "/"),
        content: readFileSync(full, "utf8")
      });
    }
  }
}

export function loadGoldenTemplate(
  rootDir: string = join(process.cwd(), "templates", "nextjs-base")
): GoldenTemplate {
  const manifest = JSON.parse(readFileSync(join(rootDir, "template.json"), "utf8")) as {
    name: string;
    lockedFiles: string[];
  };
  const files: Array<{ path: string; content: string }> = [];
  walk(rootDir, rootDir, files);
  return {
    name: manifest.name,
    lockedFiles: manifest.lockedFiles,
    files: files.filter((file) => file.path !== "template.json")
  };
}

export function isLockedFile(template: GoldenTemplate, path: string): boolean {
  return template.lockedFiles.includes(path);
}
```

- [ ] **Step 5: Run tests + typecheck, verify pass**

Run: `node --import tsx --test tests/unit/workspace-golden-template.test.mjs && pnpm typecheck`
Expected: PASS.

Note: tests run from repo root so `process.cwd()` default works; the orchestrator wiring passes an explicit path in production.

- [ ] **Step 6: Commit**

```bash
git add templates/nextjs-base apps/platform-api/src/workspace-orchestrator/template.ts tests/unit/workspace-golden-template.test.mjs
git commit -m "feat(workspace): add golden nextjs template with locked-files manifest"
```

---

### Task 8: LiteLLM compose service + workspace runtime wiring in docker-compose

**Files:**

- Modify: `docker/docker-compose.yml`
- Create: `docker/litellm-config.yaml`
- Modify: `.env.example` (append)
- Test: `tests/integration/workspace-compose-contract.test.mjs`

**Interfaces:**

- Consumes: compose services already defined (`postgres`, `minio`, `platform-api`, `caddy`).
- Produces: compose service `litellm` on the internal network; `platform-api` gains Docker socket mount + env vars `EVCP_LITELLM_BASE_URL`, `EVCP_LITELLM_MASTER_KEY`, `EVCP_WORKSPACE_SECRET_KEY`, `EVCP_WORKSPACE_IMAGE`; named network `evcp-internal` declared.

- [ ] **Step 1: Write the failing contract test**

```js
// tests/integration/workspace-compose-contract.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const compose = parse(
  readFileSync(new URL("../../docker/docker-compose.yml", import.meta.url), "utf8")
);

test("declares litellm service on internal network without published LLM admin port", () => {
  const litellm = compose.services.litellm;
  assert.ok(litellm, "litellm service missing");
  assert.match(litellm.image, /litellm/);
  assert.ok(!litellm.ports, "litellm must not publish ports to host");
  assert.ok(litellm.networks.includes("evcp-internal"));
  assert.ok(litellm.volumes.some((volume) => volume.includes("litellm-config.yaml")));
});

test("platform-api can reach docker socket and litellm", () => {
  const api = compose.services["platform-api"];
  assert.ok(api.volumes.some((volume) => volume.includes("/var/run/docker.sock")));
  const env = api.environment ?? {};
  const envEntries = Array.isArray(env) ? env : Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const joined = envEntries.join("\n");
  assert.match(joined, /EVCP_LITELLM_BASE_URL/);
  assert.match(joined, /EVCP_LITELLM_MASTER_KEY/);
  assert.match(joined, /EVCP_WORKSPACE_SECRET_KEY/);
  assert.match(joined, /EVCP_WORKSPACE_IMAGE/);
});

test("evcp-internal network is declared and used by workspace-facing services", () => {
  assert.ok(compose.networks?.["evcp-internal"], "evcp-internal network missing");
  for (const name of ["platform-api", "litellm", "postgres", "minio", "caddy"]) {
    assert.ok(
      compose.services[name].networks?.includes("evcp-internal"),
      `${name} must join evcp-internal`
    );
  }
});

test("litellm config file routes at least one provider via env-referenced key", () => {
  const config = parse(
    readFileSync(new URL("../../docker/litellm-config.yaml", import.meta.url), "utf8")
  );
  assert.ok(Array.isArray(config.model_list) && config.model_list.length >= 1);
  const first = config.model_list[0];
  assert.match(
    String(first.litellm_params.api_key),
    /^os\.environ\//,
    "keys must come from env, not literals"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/integration/workspace-compose-contract.test.mjs`
Expected: FAIL (litellm service missing). If `yaml` package is missing, add it: `pnpm add -D -w yaml`.

- [ ] **Step 3: Create `docker/litellm-config.yaml`**

```yaml
model_list:
  - model_name: coding-default
    litellm_params:
      model: anthropic/claude-sonnet-5
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: coding-fallback
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY

litellm_settings:
  drop_params: true

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/LITELLM_DATABASE_URL
```

- [ ] **Step 4: Modify `docker/docker-compose.yml`**

Add under `services:` (keep existing services untouched; add `networks: [evcp-internal]` to `postgres`, `minio`, `caddy`, `platform-api` alongside any existing networks):

```yaml
litellm:
  image: ghcr.io/berriai/litellm:main-stable
  restart: unless-stopped
  depends_on:
    - postgres
  environment:
    LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
    LITELLM_DATABASE_URL: ${LITELLM_DATABASE_URL}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    OPENAI_API_KEY: ${OPENAI_API_KEY:-}
  command: ["--config", "/etc/litellm/litellm-config.yaml"]
  volumes:
    - ./litellm-config.yaml:/etc/litellm/litellm-config.yaml:ro
  networks:
    - evcp-internal
```

Extend the existing `platform-api` service:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
environment:
  EVCP_LITELLM_BASE_URL: http://litellm:4000
  EVCP_LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
  EVCP_WORKSPACE_SECRET_KEY: ${EVCP_WORKSPACE_SECRET_KEY}
  EVCP_WORKSPACE_IMAGE: ${EVCP_WORKSPACE_IMAGE:-evcp/workspace-next:1}
networks:
  - evcp-internal
```

Add at file bottom (merge with existing top-level keys if present):

```yaml
networks:
  evcp-internal:
    driver: bridge
```

- [ ] **Step 5: Append to `.env.example`**

```bash
# MVP Plan 1: workspace foundation
LITELLM_MASTER_KEY=example-litellm-master-key-change-me
LITELLM_DATABASE_URL=postgresql://evcp:evcp@postgres:5432/litellm
EVCP_WORKSPACE_SECRET_KEY=0000000000000000000000000000000000000000000000000000000000000000
EVCP_WORKSPACE_IMAGE=evcp/workspace-next:1
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step 6: Run tests, verify pass**

Run: `node --import tsx --test tests/integration/workspace-compose-contract.test.mjs && node --import tsx --test tests/integration/install-contract.test.mjs`
Expected: PASS, and the existing install contract test still passes (fix env-name assertions there if it enumerates env keys).

- [ ] **Step 7: Commit**

```bash
git add docker/docker-compose.yml docker/litellm-config.yaml .env.example tests/integration/workspace-compose-contract.test.mjs package.json pnpm-lock.yaml
git commit -m "feat(workspace): add litellm gateway service and workspace runtime compose wiring"
```

---

### Task 9: Workspace API routes + auth-checked preview proxy resolution

**Files:**

- Create: `apps/platform-api/src/workspace-orchestrator/routes.ts`
- Modify: `apps/platform-api/src/app-factory.ts` (wire module into request dispatch; follow the pattern of existing service route blocks in `executePlatformApiRequest`)
- Modify: `docker/Caddyfile` (route `/preview/*` to platform-api)
- Test: `tests/unit/workspace-routes.test.mjs`

**Interfaces:**

- Consumes: `WorkspaceOrchestrator` (Task 6), existing auth resolution (`AuthResolution` with roles/permissions from `platform-services.ts`), existing audit service.
- Produces HTTP-agnostic handlers (same `PlatformRequest`/`PlatformResponse` convention as `executePlatformApiRequest`):
  - `POST /projects/{projectId}/workspace` → provision (creator/owner of project only)
  - `GET /projects/{projectId}/workspace` → record + secret **names**
  - `POST /projects/{projectId}/workspace/stop` / `POST /projects/{projectId}/workspace/wake`
  - `resolvePreviewTarget(orchestrator, auth, slug): { ok: true; upstream: string } | { ok: false; status: 401 | 403 | 404 | 503 }` — used by the preview proxy: checks session, project membership, workspace running (waking idle workspaces implicitly).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-routes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const { createWorkspaceRoutes, resolvePreviewTarget } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/routes.ts"
);
const { createWorkspaceOrchestrator } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts"
);
const { createPgClientPostgresProvisioner } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts"
);
const { createMemoryObjectStorageProvisioner, createMemoryLlmGatewayAdmin } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/resource-ports.ts"
);
const { createProjectSecretStore } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/secret-store.ts"
);
const { createMemoryDockerEngine } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts"
);

function fixture() {
  const orchestrator = createWorkspaceOrchestrator({
    postgres: createPgClientPostgresProvisioner(async () => {}),
    objectStorage: createMemoryObjectStorageProvisioner(),
    llmGateway: createMemoryLlmGatewayAdmin(),
    secrets: createProjectSecretStore({ encryptionKeyHex: randomBytes(32).toString("hex") }),
    docker: createMemoryDockerEngine()
  });
  const creator = { userId: "u-creator", roles: ["creator"], projectIds: ["p1"] };
  const outsider = { userId: "u-outsider", roles: ["creator"], projectIds: [] };
  const routes = createWorkspaceRoutes({ orchestrator });
  return { orchestrator, routes, creator, outsider };
}

test("creator can provision a workspace and read names-only secrets", async () => {
  const { routes, creator } = fixture();
  const created = await routes.provision(creator, { projectId: "p1", slug: "leave-tracker" });
  assert.equal(created.status, 201);
  assert.equal(created.body.workspace.state, "running");

  const detail = await routes.get(creator, { projectId: "p1" });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.secretNames.includes("DATABASE_URL"));
  assert.ok(!JSON.stringify(detail.body).includes("postgresql://"), "no secret values in response");
});

test("non-member gets 403 on provision and get", async () => {
  const { routes, creator, outsider } = fixture();
  await routes.provision(creator, { projectId: "p1", slug: "leave-tracker" });
  assert.equal((await routes.provision(outsider, { projectId: "p1", slug: "x-y-z" })).status, 403);
  assert.equal((await routes.get(outsider, { projectId: "p1" })).status, 403);
});

test("preview target resolves for members, wakes idle workspaces, rejects others", async () => {
  const { orchestrator, routes, creator, outsider } = fixture();
  await routes.provision(creator, { projectId: "p1", slug: "leave-tracker" });

  const ok = await resolvePreviewTarget(orchestrator, creator, "leave-tracker");
  assert.deepEqual(ok, { ok: true, upstream: "http://evcp-ws-leave-tracker:3000" });

  await orchestrator.stopWorkspace("p1");
  const woken = await resolvePreviewTarget(orchestrator, creator, "leave-tracker");
  assert.equal(woken.ok, true);
  assert.equal(orchestrator.getWorkspace("p1").state, "running");

  assert.deepEqual(await resolvePreviewTarget(orchestrator, outsider, "leave-tracker"), {
    ok: false,
    status: 403
  });
  assert.deepEqual(await resolvePreviewTarget(orchestrator, null, "leave-tracker"), {
    ok: false,
    status: 401
  });
  assert.deepEqual(await resolvePreviewTarget(orchestrator, creator, "no-such-app"), {
    ok: false,
    status: 404
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-routes.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `apps/platform-api/src/workspace-orchestrator/routes.ts`**

```ts
import type { WorkspaceOrchestrator } from "./orchestrator";

export interface WorkspaceAuthContext {
  userId: string;
  roles: string[];
  projectIds: string[];
}

interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

function isMember(auth: WorkspaceAuthContext, projectId: string): boolean {
  return auth.projectIds.includes(projectId);
}

export function createWorkspaceRoutes(deps: { orchestrator: WorkspaceOrchestrator }) {
  const { orchestrator } = deps;
  return {
    async provision(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string }
    ): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      const workspace = await orchestrator.provisionWorkspace(input);
      return { status: 201, body: { workspace } };
    },

    async get(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      const workspace = orchestrator.getWorkspace(input.projectId);
      if (!workspace) {
        return { status: 404, body: { error: "not_found" } };
      }
      return {
        status: 200,
        body: { workspace, secretNames: orchestrator.listSecretNames(input.projectId) }
      };
    },

    async stop(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return {
        status: 200,
        body: { workspace: await orchestrator.stopWorkspace(input.projectId) }
      };
    },

    async wake(auth: WorkspaceAuthContext, input: { projectId: string }): Promise<RouteResponse> {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return {
        status: 200,
        body: { workspace: await orchestrator.wakeWorkspace(input.projectId) }
      };
    }
  };
}

export type PreviewResolution =
  | { ok: true; upstream: string }
  | { ok: false; status: 401 | 403 | 404 | 503 };

export async function resolvePreviewTarget(
  orchestrator: WorkspaceOrchestrator,
  auth: WorkspaceAuthContext | null,
  slug: string
): Promise<PreviewResolution> {
  if (!auth) {
    return { ok: false, status: 401 };
  }
  // find workspace record by slug
  let record: ReturnType<WorkspaceOrchestrator["getWorkspace"]> = null;
  for (const projectId of auth.projectIds) {
    const candidate = orchestrator.getWorkspace(projectId);
    if (candidate?.slug === slug) {
      record = candidate;
      break;
    }
  }
  if (!record) {
    // distinguish "exists but not yours" from "does not exist" is deferred;
    // membership scan above means unknown slug and non-member both need a wider lookup
    const anyWorkspace = orchestrator.findBySlug?.(slug) ?? null;
    return anyWorkspace ? { ok: false, status: 403 } : { ok: false, status: 404 };
  }
  if (record.state === "idle") {
    await orchestrator.wakeWorkspace(record.projectId);
  } else if (record.state !== "running") {
    return { ok: false, status: 503 };
  }
  orchestrator.markActivity(record.projectId);
  return { ok: true, upstream: `http://evcp-ws-${slug}:3000` };
}
```

Also add to the orchestrator in Task 6's file (`orchestrator.ts`) — a `findBySlug` method inside the returned object:

```ts
    findBySlug(slug: string): WorkspaceContainerRecord | null {
      for (const record of records.values()) {
        if (record.slug === slug) {
          return record;
        }
      }
      return null;
    },
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --import tsx --test tests/unit/workspace-routes.test.mjs tests/unit/workspace-orchestrator.test.mjs && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Wire into `apps/platform-api/src/app-factory.ts` and `docker/Caddyfile`**

In `app-factory.ts`: construct the orchestrator + routes next to the other services created in `createPlatformApiServices` wiring, map auth from the existing `AuthResolution` (userId, roles, project memberships), and dispatch paths `POST/GET /projects/:id/workspace`, `POST .../stop`, `POST .../wake`, plus `GET /preview/:slug/*` → `resolvePreviewTarget` → HTTP proxy (use `fetch` pass-through of method/headers/body to `upstream`). Follow the existing route-dispatch style in `executePlatformApiRequest` — add a `workspace` block alongside existing blocks. Real Docker/Postgres/MinIO adapters are selected only when `EVCP_CORE_PERSISTENCE=prisma`-style runtime env is present; otherwise memory fakes (same convention as persistence modes).

In `docker/Caddyfile`, ensure `/preview/*` routes to platform-api (same upstream as `/api`):

```caddyfile
handle_path /preview/* {
  reverse_proxy platform-api:3001
}
```

(Adjust the platform-api port to the one already used in the existing Caddyfile `/api` block.)

- [ ] **Step 6: Run the full gates**

Run: `pnpm typecheck && pnpm test:unit && pnpm test:integration`
Expected: PASS — existing suites unaffected.

- [ ] **Step 7: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/routes.ts apps/platform-api/src/workspace-orchestrator/orchestrator.ts apps/platform-api/src/app-factory.ts docker/Caddyfile tests/unit/workspace-routes.test.mjs
git commit -m "feat(workspace): add workspace API routes and auth-checked preview resolution"
```

---

### Task 10: Idle sweep scheduler + workspace verify script

**Files:**

- Modify: `apps/platform-api/src/main.ts` (start idle sweep interval)
- Modify: `package.json` (add `verify:workspace` script)
- Test: `tests/unit/workspace-idle-sweep.test.mjs`

**Interfaces:**

- Consumes: `stopIdleWorkspaces` (Task 6).
- Produces: `startIdleSweep(orchestrator, { intervalMs }): { stop(): void }` exported from `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`; script `pnpm verify:workspace` running all Plan-1 tests.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/workspace-idle-sweep.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { startIdleSweep } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/orchestrator.ts"
);

test("idle sweep invokes stopIdleWorkspaces on interval and can be stopped", async () => {
  let calls = 0;
  const fakeOrchestrator = {
    stopIdleWorkspaces: async () => {
      calls += 1;
      return [];
    }
  };
  const sweep = startIdleSweep(fakeOrchestrator, { intervalMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 35));
  sweep.stop();
  const settled = calls;
  assert.ok(settled >= 2, `expected >=2 sweeps, got ${settled}`);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, settled, "no sweeps after stop");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-idle-sweep.test.mjs`
Expected: FAIL (`startIdleSweep` not exported).

- [ ] **Step 3: Append to `apps/platform-api/src/workspace-orchestrator/orchestrator.ts`**

```ts
export function startIdleSweep(
  orchestrator: Pick<WorkspaceOrchestrator, "stopIdleWorkspaces">,
  opts: { intervalMs?: number } = {}
): { stop(): void } {
  const intervalMs = opts.intervalMs ?? 60_000;
  const timer = setInterval(() => {
    void orchestrator.stopIdleWorkspaces().catch(() => undefined);
  }, intervalMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
    }
  };
}
```

In `apps/platform-api/src/main.ts`, after services are created, start the sweep when workspace mode is enabled (guard with env so tests/legacy mode are unaffected):

```ts
if (process.env.EVCP_WORKSPACE_SECRET_KEY) {
  startIdleSweep(workspaceOrchestrator);
}
```

- [ ] **Step 4: Add verify script to root `package.json` scripts**

```json
"verify:workspace": "node --import tsx --test tests/unit/workspace-*.test.mjs tests/integration/workspace-compose-contract.test.mjs"
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm verify:workspace && pnpm typecheck && pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/orchestrator.ts apps/platform-api/src/main.ts package.json tests/unit/workspace-idle-sweep.test.mjs
git commit -m "feat(workspace): add idle sweep scheduler and verify:workspace gate"
```

---

## Deferred to later plans (do NOT build here)

- Real `createDockerodeEngine` end-to-end verification against a live daemon (smoke-tested during Plan 2 integration when the generation loop needs exec).
- Git repo initialization from the golden template (Plan 2 — generation loop owns workspace file lifecycle).
- Chat SSE route, message parser, action runner (Plan 2).
- Workbench UI (Plan 3). Publish pipeline + production containers + `/apps/{slug}` (Plan 4).
- Keycloak real OIDC browser flow (tracked as its own pre-existing Phase-2 workstream; Plan-1 routes use the existing auth resolution abstraction so they inherit it when it lands).

## Self-review notes

- Spec coverage (spec §3-4): types/state ✅ T1, Postgres isolation ✅ T2, MinIO + LiteLLM key ✅ T3, secrets names-only ✅ T4, container spec/no published ports ✅ T5, atomic provision + rollback + lifecycle + idle ✅ T6/T10, golden template + locked files ✅ T7, LiteLLM compose + internal network ✅ T8, routes + preview auth resolution + Caddy ✅ T9. Migration flow, chat, publish → later plans per spec sections 5-6.
- Type consistency: `WorkspaceOrchestrator` produced in T6 consumed by T9/T10; `findBySlug` added in T9 modifies T6's file — flagged explicitly in T9 Step 3.
