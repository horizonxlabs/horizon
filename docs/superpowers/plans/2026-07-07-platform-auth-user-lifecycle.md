# Platform User Lifecycle + Native Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let IT admins create Creator users (persisted in Postgres) and let those Creators log in with native email+password (temp password → forced change on first login) to use the existing vibe workspace.

**Architecture:** Add password columns to the Prisma `PlatformUser`. A pure `bcryptjs` hashing util feeds an isolated `PlatformCredentialService` that talks to a small `CredentialStore` port (memory fake for tests, Prisma-backed for real). Three HTTP handlers in `app-factory.ts` (`POST /admin/users`, `POST /auth/login`, `POST /auth/change-password`) use the service and reuse the existing `issuePlatformSession` + `evcp_session` token — so every downstream authorization path is unchanged. admin-web gains a Users page; creator-web gains a login + change-password screen replacing the auto simulate-login bridge.

**Tech Stack:** TypeScript, NestJS/Express (platform-api), Prisma + Postgres, bcryptjs (pure JS), React + Vite (admin-web, creator-web), node:test `.mjs` via `node --import tsx --test`.

## Global Constraints

- Secrets are platform-managed; the Creator never sees secret values — only env var NAMES surface in UI. Passwords: plaintext and `passwordHash` NEVER appear in any API response, log line, or audit metadata.
- Use `bcryptjs` (pure JS). Do NOT use native `bcrypt` (breaks in the alpine container).
- Reuse the existing `PlatformAuthSession` + `evcp_session` signed token and the existing `PlatformRole` model. Do NOT invent a new session or role concept.
- Do NOT break the memory/simulate path used by the existing 346+ tests. `simulate-login` stays available behind a dev flag.
- Login failures return a uniform `401 { error: "invalid_credentials" }` — never reveal which factor failed (no user enumeration).
- Password policy: minimum 8 characters, bcryptjs cost factor 10.
- TDD: write the failing test first; `.mjs` tests via `node --import tsx --test`, same style as `tests/unit/*.test.mjs`.
- New nullable columns only — no backfill; existing users keep `passwordHash = null` and cannot log in natively (rejected as invalid credentials).

---

## File Structure

- `apps/platform-api/prisma/schema.prisma` — add 3 fields to `model PlatformUser` (Task 1).
- `apps/platform-api/package.json` — add `bcryptjs` + `@types/bcryptjs` (Task 2).
- `apps/platform-api/src/auth/password-hash.ts` — pure hashing util (Task 2).
- `apps/platform-api/src/auth/platform-credential-service.ts` — service + `CredentialStore` port + memory fake (Task 3).
- `apps/platform-api/src/auth/prisma-credential-store.ts` — `CredentialStore` over `CorePersistenceClient.platformUser` (Task 4).
- `apps/platform-api/src/persistence/core-repositories.ts` — extend `CorePersistenceClient["platformUser"]` type + `MemoryCorePersistenceClient` with credential fields + `update`/`create` (Task 4).
- `packages/types/src/index.ts` — request/response DTOs (Task 5).
- `apps/platform-api/src/app-factory.ts` — wire the 3 routes + gate simulate-login (Tasks 5, 6).
- `apps/admin-web/src/main.tsx` — Users page + create form (Task 7).
- `apps/creator-web/src/main.tsx` — login + change-password screens (Task 8).
- Tests under `tests/unit/` and `tests/integration/`.

---

### Task 1: Prisma schema — password columns on PlatformUser

**Files:**
- Modify: `apps/platform-api/prisma/schema.prisma` (`model PlatformUser`)
- Migration: `apps/platform-api/prisma/migrations/<timestamp>_platform_user_credentials/migration.sql` (generated)

**Interfaces:**
- Produces: `PlatformUser.passwordHash: String?`, `PlatformUser.mustChangePassword: Boolean` (default false), `PlatformUser.passwordUpdatedAt: DateTime?` in the Prisma schema and Postgres.

- [ ] **Step 1: Add the three fields**

In `apps/platform-api/prisma/schema.prisma`, inside `model PlatformUser { ... }`, directly after the existing `status  UserStatus  @default(active)` line, add:

```prisma
  passwordHash       String?
  mustChangePassword Boolean   @default(false)
  passwordUpdatedAt  DateTime?
```

- [ ] **Step 2: Create the migration against the running Postgres**

Run (from repo root; the compose Postgres is up and `DATABASE_URL` is set in the platform-api container — run inside it so the URL resolves):

```bash
docker exec evcp-platform-api sh -lc 'cd /workspace/apps/platform-api && npx prisma migrate dev --name platform_user_credentials --create-only'
```

Expected: a new folder `prisma/migrations/<timestamp>_platform_user_credentials/` containing `migration.sql` with `ALTER TABLE "platform_users" ADD COLUMN ...` for the three columns (exact table name follows the model's `@@map`; do not hand-edit).

- [ ] **Step 3: Apply the migration**

```bash
docker exec evcp-platform-api sh -lc 'cd /workspace/apps/platform-api && npx prisma migrate deploy && npx prisma generate'
```

Expected: "1 migration applied" (or "already applied") and "Generated Prisma Client".

- [ ] **Step 4: Verify the columns exist**

```bash
docker exec evcp-postgres sh -lc 'psql -U "${POSTGRES_USER:-evcp}" -d "${POSTGRES_DB:-evcp}" -c "\d platform_users" | grep -E "password_hash|must_change_password|password_updated_at"'
```

Expected: three rows printed (the new columns). If the table name differs, use the name Prisma emitted in the migration SQL.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/prisma/schema.prisma apps/platform-api/prisma/migrations
git commit -m "feat(auth): add password credential columns to PlatformUser"
```

---

### Task 2: Password hashing utility (bcryptjs)

**Files:**
- Modify: `apps/platform-api/package.json` (dependencies)
- Create: `apps/platform-api/src/auth/password-hash.ts`
- Test: `tests/unit/password-hash.test.mjs`

**Interfaces:**
- Produces:
  - `MIN_PASSWORD_LENGTH: number` (= 8)
  - `isStrongEnough(plaintext: string): boolean`
  - `hashPassword(plaintext: string): Promise<string>`
  - `verifyPassword(plaintext: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Install bcryptjs**

```bash
cd apps/platform-api && pnpm add bcryptjs && pnpm add -D @types/bcryptjs
```
Expected: `bcryptjs` appears under `dependencies` and `@types/bcryptjs` under `devDependencies` in `apps/platform-api/package.json`.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/password-hash.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

const { hashPassword, verifyPassword, isStrongEnough, MIN_PASSWORD_LENGTH } = await import(
  "../../apps/platform-api/src/auth/password-hash.ts"
);

test("hash is not the plaintext and verifies", async () => {
  const hash = await hashPassword("correct horse 8");
  assert.notEqual(hash, "correct horse 8");
  assert.equal(await verifyPassword("correct horse 8", hash), true);
});

test("verify fails for the wrong password", async () => {
  const hash = await hashPassword("correct horse 8");
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("isStrongEnough enforces the minimum length", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(isStrongEnough("short7!"), false);
  assert.equal(isStrongEnough("longenough8"), true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/password-hash.test.mjs`
Expected: FAIL — cannot resolve `../../apps/platform-api/src/auth/password-hash.ts`.

- [ ] **Step 4: Implement the utility**

Create `apps/platform-api/src/auth/password-hash.ts`:

```typescript
import bcrypt from "bcryptjs";

export const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 10;

export function isStrongEnough(plaintext: string): boolean {
  return typeof plaintext === "string" && plaintext.length >= MIN_PASSWORD_LENGTH;
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plaintext, hash);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/password-hash.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/package.json pnpm-lock.yaml apps/platform-api/src/auth/password-hash.ts tests/unit/password-hash.test.mjs
git commit -m "feat(auth): bcryptjs password hashing utility"
```

---

### Task 3: PlatformCredentialService + CredentialStore port

**Files:**
- Create: `apps/platform-api/src/auth/platform-credential-service.ts`
- Test: `tests/unit/platform-credential-service.test.mjs`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `isStrongEnough` from `./password-hash` (Task 2).
- Produces:
  - `interface CredentialRecord { userId: string; passwordHash: string | null; mustChangePassword: boolean }`
  - `interface CredentialStore { getByEmail(email: string): Promise<CredentialRecord | null>; getById(userId: string): Promise<CredentialRecord | null>; setPassword(userId: string, fields: { passwordHash: string; mustChangePassword: boolean }): Promise<void>; }`
  - `interface PlatformCredentialService { setPassword(userId: string, plaintext: string, opts: { mustChange: boolean }): Promise<{ ok: true } | { ok: false; reason: "weak_password" }>; verifyLogin(email: string, plaintext: string): Promise<{ userId: string; mustChangePassword: boolean } | null>; changePassword(userId: string, currentPlaintext: string, newPlaintext: string): Promise<{ ok: true } | { ok: false; reason: "wrong_current" | "weak_password" }>; }`
  - `createPlatformCredentialService(store: CredentialStore): PlatformCredentialService`
  - `class MemoryCredentialStore implements CredentialStore` (seedable, for tests) with constructor `new MemoryCredentialStore(seed?: Array<{ userId: string; email: string; passwordHash?: string | null; mustChangePassword?: boolean }>)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/platform-credential-service.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformCredentialService, MemoryCredentialStore } = await import(
  "../../apps/platform-api/src/auth/platform-credential-service.ts"
);

test("setPassword rejects a weak password", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]);
  const svc = createPlatformCredentialService(store);
  const result = await svc.setPassword("u1", "short7!", { mustChange: true });
  assert.deepEqual(result, { ok: false, reason: "weak_password" });
});

test("verifyLogin succeeds after setPassword and reports mustChange", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]);
  const svc = createPlatformCredentialService(store);
  await svc.setPassword("u1", "temp-pass-1", { mustChange: true });
  const ok = await svc.verifyLogin("a@co", "temp-pass-1");
  assert.deepEqual(ok, { userId: "u1", mustChangePassword: true });
});

test("verifyLogin returns null for unknown email and for a user with no hash", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]); // no password set
  const svc = createPlatformCredentialService(store);
  assert.equal(await svc.verifyLogin("missing@co", "whatever8"), null);
  assert.equal(await svc.verifyLogin("a@co", "whatever8"), null);
});

test("changePassword requires the correct current password and clears mustChange", async () => {
  const store = new MemoryCredentialStore([{ userId: "u1", email: "a@co" }]);
  const svc = createPlatformCredentialService(store);
  await svc.setPassword("u1", "temp-pass-1", { mustChange: true });
  assert.deepEqual(await svc.changePassword("u1", "wrong-pass-1", "new-pass-12"), { ok: false, reason: "wrong_current" });
  assert.deepEqual(await svc.changePassword("u1", "temp-pass-1", "weak7!"), { ok: false, reason: "weak_password" });
  assert.deepEqual(await svc.changePassword("u1", "temp-pass-1", "new-pass-12"), { ok: true });
  const relogin = await svc.verifyLogin("a@co", "new-pass-12");
  assert.deepEqual(relogin, { userId: "u1", mustChangePassword: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/platform-credential-service.test.mjs`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement the service + memory store**

Create `apps/platform-api/src/auth/platform-credential-service.ts`:

```typescript
import { hashPassword, verifyPassword, isStrongEnough } from "./password-hash";

export interface CredentialRecord {
  userId: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
}

export interface CredentialStore {
  getByEmail(email: string): Promise<CredentialRecord | null>;
  getById(userId: string): Promise<CredentialRecord | null>;
  setPassword(userId: string, fields: { passwordHash: string; mustChangePassword: boolean }): Promise<void>;
}

export interface PlatformCredentialService {
  setPassword(userId: string, plaintext: string, opts: { mustChange: boolean }): Promise<{ ok: true } | { ok: false; reason: "weak_password" }>;
  verifyLogin(email: string, plaintext: string): Promise<{ userId: string; mustChangePassword: boolean } | null>;
  changePassword(userId: string, currentPlaintext: string, newPlaintext: string): Promise<{ ok: true } | { ok: false; reason: "wrong_current" | "weak_password" }>;
}

export function createPlatformCredentialService(store: CredentialStore): PlatformCredentialService {
  return {
    async setPassword(userId, plaintext, opts) {
      if (!isStrongEnough(plaintext)) return { ok: false, reason: "weak_password" };
      const passwordHash = await hashPassword(plaintext);
      await store.setPassword(userId, { passwordHash, mustChangePassword: opts.mustChange });
      return { ok: true };
    },
    async verifyLogin(email, plaintext) {
      const record = await store.getByEmail(email.trim().toLowerCase());
      if (!record || !record.passwordHash) return null;
      const ok = await verifyPassword(plaintext, record.passwordHash);
      if (!ok) return null;
      return { userId: record.userId, mustChangePassword: record.mustChangePassword };
    },
    async changePassword(userId, currentPlaintext, newPlaintext) {
      const record = await store.getById(userId);
      if (!record || !record.passwordHash) return { ok: false, reason: "wrong_current" };
      if (!(await verifyPassword(currentPlaintext, record.passwordHash))) return { ok: false, reason: "wrong_current" };
      if (!isStrongEnough(newPlaintext)) return { ok: false, reason: "weak_password" };
      const passwordHash = await hashPassword(newPlaintext);
      await store.setPassword(userId, { passwordHash, mustChangePassword: false });
      return { ok: true };
    }
  };
}

export class MemoryCredentialStore implements CredentialStore {
  private readonly rows: Array<{ userId: string; email: string; passwordHash: string | null; mustChangePassword: boolean }>;

  constructor(seed: Array<{ userId: string; email: string; passwordHash?: string | null; mustChangePassword?: boolean }> = []) {
    this.rows = seed.map((row) => ({
      userId: row.userId,
      email: row.email.trim().toLowerCase(),
      passwordHash: row.passwordHash ?? null,
      mustChangePassword: row.mustChangePassword ?? false
    }));
  }

  async getByEmail(email: string): Promise<CredentialRecord | null> {
    const row = this.rows.find((candidate) => candidate.email === email.trim().toLowerCase());
    return row ? { userId: row.userId, passwordHash: row.passwordHash, mustChangePassword: row.mustChangePassword } : null;
  }

  async getById(userId: string): Promise<CredentialRecord | null> {
    const row = this.rows.find((candidate) => candidate.userId === userId);
    return row ? { userId: row.userId, passwordHash: row.passwordHash, mustChangePassword: row.mustChangePassword } : null;
  }

  async setPassword(userId: string, fields: { passwordHash: string; mustChangePassword: boolean }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.userId === userId);
    if (!row) throw new Error(`unknown user ${userId}`);
    row.passwordHash = fields.passwordHash;
    row.mustChangePassword = fields.mustChangePassword;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/platform-credential-service.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/auth/platform-credential-service.ts tests/unit/platform-credential-service.test.mjs
git commit -m "feat(auth): PlatformCredentialService with CredentialStore port + memory fake"
```

---

### Task 4: Prisma-backed CredentialStore + user creation

**Context:** `apps/platform-api/src/persistence/core-repositories.ts` defines `interface CorePersistenceClient` (line ~98) whose `platformUser` member is a Prisma-delegate-shaped object (real Prisma client is cast to it in `createPrismaCorePersistence`), and `class MemoryCorePersistenceClient` (line ~251) is the in-memory fake seeding `platformUser`. This task extends BOTH so credential fields + `create`/`update` are available, then implements the `CredentialStore` over that client plus a `createUser` helper.

**Files:**
- Modify: `apps/platform-api/src/persistence/core-repositories.ts` (extend `CorePersistenceClient["platformUser"]` type + `MemoryCorePersistenceClient.platformUser`)
- Create: `apps/platform-api/src/auth/prisma-credential-store.ts`
- Test: `tests/unit/prisma-credential-store.test.mjs`

**Interfaces:**
- Consumes: `CredentialStore`, `CredentialRecord` from `./platform-credential-service` (Task 3).
- Produces:
  - Extended `CorePersistenceClient["platformUser"]` supporting: `findUnique({ where: { email } | { id } })` returning a record with `id, email, name, role/status..., passwordHash, mustChangePassword`; `update({ where: { id }, data })`; `create({ data })`.
  - `createCorePersistenceCredentialStore(client: CorePersistenceClient): CredentialStore`
  - `createUserWithRole(client: CorePersistenceClient, input: { id: string; email: string; name: string; role: string }): Promise<{ id: string; email: string; name: string; role: string; status: string }>`

- [ ] **Step 1: Extend the client type + memory fake**

In `apps/platform-api/src/persistence/core-repositories.ts`:

(a) Find the `platformUser` member on `interface CorePersistenceClient` (around line 98–105). It currently exposes `findUnique`. Replace that member with a shape that also carries the credential fields and `update`/`create`:

```typescript
  platformUser: {
    findUnique(args: { where: { email: string } | { id: string } }): Promise<
      | {
          id: string;
          email: string;
          name: string;
          status: string;
          passwordHash: string | null;
          mustChangePassword: boolean;
        }
      | null
    >;
    update(args: { where: { id: string }; data: { passwordHash?: string; mustChangePassword?: boolean; passwordUpdatedAt?: Date } }): Promise<{ id: string }>;
    create(args: { data: { id: string; email: string; name: string; status?: string } }): Promise<{ id: string; email: string; name: string; status: string }>;
  };
```

(Only add fields — keep any existing `findUnique` select behaviour the file relies on. The real Prisma client already implements all of these; this only widens the TypeScript surface.)

(b) In `class MemoryCorePersistenceClient` (around line 251), update the `platformUser` object so its stored rows include `passwordHash: string | null` and `mustChangePassword: boolean` (default `null`/`false` when seeding), and add `update` and `create` methods mirroring the interface:

```typescript
    this.platformUser = {
      findUnique: async ({ where }) => {
        const row = users.find((u) => ("email" in where ? u.email === where.email : u.id === where.id));
        return row
          ? { id: row.id, email: row.email, name: row.name, status: row.status ?? "active", passwordHash: row.passwordHash ?? null, mustChangePassword: row.mustChangePassword ?? false }
          : null;
      },
      update: async ({ where, data }) => {
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error(`unknown user ${where.id}`);
        if (data.passwordHash !== undefined) row.passwordHash = data.passwordHash;
        if (data.mustChangePassword !== undefined) row.mustChangePassword = data.mustChangePassword;
        return { id: row.id };
      },
      create: async ({ data }) => {
        users.push({ id: data.id, email: data.email, name: data.name, status: data.status ?? "active", passwordHash: null, mustChangePassword: false });
        return { id: data.id, email: data.email, name: data.name, status: data.status ?? "active" };
      }
    };
```

(Adapt the local variable name `users` to whatever the constructor already uses for the seeded platform-user array. If the fake stores users in `this._users` or similar, use that. Preserve existing seeded fields.)

- [ ] **Step 2: Write the failing test**

Create `tests/unit/prisma-credential-store.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

const { MemoryCorePersistenceClient } = await import("../../apps/platform-api/src/persistence/core-repositories.ts");
const { createCorePersistenceCredentialStore, createUserWithRole } = await import(
  "../../apps/platform-api/src/auth/prisma-credential-store.ts"
);

test("createUserWithRole then store round-trips credentials", async () => {
  const client = new MemoryCorePersistenceClient();
  const user = await createUserWithRole(client, { id: "usr_1", email: "New@Co.com", name: "New", role: "creator" });
  assert.equal(user.email, "new@co.com");

  const store = createCorePersistenceCredentialStore(client);
  await store.setPassword("usr_1", { passwordHash: "hash-abc", mustChangePassword: true });
  const byEmail = await store.getByEmail("new@co.com");
  assert.deepEqual(byEmail, { userId: "usr_1", passwordHash: "hash-abc", mustChangePassword: true });
  const byId = await store.getById("usr_1");
  assert.equal(byId.passwordHash, "hash-abc");
});

test("getByEmail returns null for unknown email", async () => {
  const store = createCorePersistenceCredentialStore(new MemoryCorePersistenceClient());
  assert.equal(await store.getByEmail("missing@co.com"), null);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/prisma-credential-store.test.mjs`
Expected: FAIL — cannot resolve `prisma-credential-store.ts`.

- [ ] **Step 4: Implement the store + user creation**

Create `apps/platform-api/src/auth/prisma-credential-store.ts`:

```typescript
import type { CredentialStore, CredentialRecord } from "./platform-credential-service";
import type { CorePersistenceClient } from "../persistence/core-repositories";

export function createCorePersistenceCredentialStore(client: CorePersistenceClient): CredentialStore {
  return {
    async getByEmail(email: string): Promise<CredentialRecord | null> {
      const row = await client.platformUser.findUnique({ where: { email: email.trim().toLowerCase() } });
      return row ? { userId: row.id, passwordHash: row.passwordHash, mustChangePassword: row.mustChangePassword } : null;
    },
    async getById(userId: string): Promise<CredentialRecord | null> {
      const row = await client.platformUser.findUnique({ where: { id: userId } });
      return row ? { userId: row.id, passwordHash: row.passwordHash, mustChangePassword: row.mustChangePassword } : null;
    },
    async setPassword(userId, fields): Promise<void> {
      await client.platformUser.update({
        where: { id: userId },
        data: { passwordHash: fields.passwordHash, mustChangePassword: fields.mustChangePassword, passwordUpdatedAt: new Date() }
      });
    }
  };
}

export async function createUserWithRole(
  client: CorePersistenceClient,
  input: { id: string; email: string; name: string; role: string }
): Promise<{ id: string; email: string; name: string; status: string }> {
  const email = input.email.trim().toLowerCase();
  return client.platformUser.create({ data: { id: input.id, email, name: input.name.trim() || email, status: "active" } });
}
```

Note on role assignment: the Prisma `create` above stores the user. The platform role (`creator`) is carried in the create-user route via the existing role wiring — see Task 5, Step 3, which sets the role on the created user through the same path `simulateLogin`/`provisionSsoUser` uses (`role` field on the user record / `PlatformUserRole`). If the running schema stores role as a scalar on the user, extend the `create` `data` with `role: input.role`; if it uses the `PlatformUserRole` join, Task 5 performs the role insert. Confirm which by checking whether `MemoryCorePersistenceClient` rows carry a `role` field, and mirror that in `create`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/prisma-credential-store.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify existing core-persistence tests still pass**

Run: `node --import tsx --test tests/integration/platform-core-api-persistence-contract.test.mjs`
Expected: PASS (unchanged) — the widened client type must not break existing behaviour.

- [ ] **Step 7: Commit**

```bash
git add apps/platform-api/src/persistence/core-repositories.ts apps/platform-api/src/auth/prisma-credential-store.ts tests/unit/prisma-credential-store.test.mjs
git commit -m "feat(auth): Prisma-backed CredentialStore + createUserWithRole"
```

---

### Task 5: HTTP routes — create user, login, change password (+ DTOs)

**Context:** Routes live in `apps/platform-api/src/app-factory.ts`. The handler dispatch matches `request.method` + `request.path` (see the `/admin/auth/providers/oidc` handler around line 1776) and returns `{ status, body }` using the `success(...)` / `failure(...)` helpers and `HttpStatus`. Admin identity comes from `services.auth.resolveCurrentUser(request.headers ?? {})`. Session issuance for real login reuses `services.authSso`'s session path — the same `issuePlatformSession` used by `simulateLogin` (platform-services.ts ~2345). The credential service is constructed once where `services` is assembled and threaded onto the request context.

**Files:**
- Modify: `packages/types/src/index.ts` (DTOs)
- Modify: `apps/platform-api/src/app-factory.ts` (construct the credential service; add 3 route handlers + register their paths in the path union near line 137–144)
- Test: `tests/integration/platform-auth-native-contract.test.mjs`

**Interfaces:**
- Consumes: `createPlatformCredentialService` (Task 3), `createCorePersistenceCredentialStore`, `createUserWithRole` (Task 4), the existing `issuePlatformSession` path, `services.corePersistence.getUserByEmail`.
- Produces (DTOs in `@evcp/types`):
  - `CreatePlatformUserRequest { email: string; name: string; role?: string; tempPassword: string }`
  - `PlatformUserSummary { id: string; email: string; name: string; role: string; status: string; mustChangePassword: boolean }`
  - `NativeLoginRequest { email: string; password: string }`
  - `NativeLoginResponse { token: string; expiresAt: string; mustChangePassword: boolean }`
  - `ChangePasswordRequest { currentPassword: string; newPassword: string }`

- [ ] **Step 1: Add DTOs**

In `packages/types/src/index.ts`, add:

```typescript
export interface CreatePlatformUserRequest {
  email: string;
  name: string;
  role?: string;
  tempPassword: string;
}

export interface PlatformUserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
}

export interface NativeLoginRequest {
  email: string;
  password: string;
}

export interface NativeLoginResponse {
  token: string;
  expiresAt: string;
  mustChangePassword: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
```

- [ ] **Step 2: Write the failing integration test**

Create `tests/integration/platform-auth-native-contract.test.mjs`. This drives the in-process app in memory mode (no real Postgres) via the same harness the existing contract tests use. Mirror the setup of `tests/integration/platform-core-api-persistence-contract.test.mjs` for building the app/executor; the assertions are:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

// Build the in-process request executor the same way the sibling persistence
// contract test does (memory core-persistence mode). Import that helper/setup.
const { buildTestExecutor } = await import("./helpers/auth-native-harness.mjs");

test("admin creates a user, user logs in, changes password", async () => {
  const exec = await buildTestExecutor(); // admin session available as exec.asAdmin(...)

  // 1. Admin creates a Creator with a temp password.
  const created = await exec.asAdmin({
    method: "POST",
    path: "/admin/users",
    body: { email: "creator1@company.com", name: "Creator One", role: "creator", tempPassword: "temp-pass-1" }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.mustChangePassword, true);
  assert.equal(created.body.data.email, "creator1@company.com");
  assert.equal("passwordHash" in created.body.data, false); // never leaks the hash

  // 2. Login with the temp password → session + mustChangePassword flag.
  const login = await exec.anon({
    method: "POST",
    path: "/auth/login",
    body: { email: "creator1@company.com", password: "temp-pass-1" }
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.data.token.startsWith("evcp_session."));
  assert.equal(login.body.data.mustChangePassword, true);

  // 3. Wrong password → uniform 401 invalid_credentials.
  const bad = await exec.anon({ method: "POST", path: "/auth/login", body: { email: "creator1@company.com", password: "nope-nope-1" } });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, "invalid_credentials");

  // 4. Unknown email → same uniform 401 (no enumeration).
  const unknown = await exec.anon({ method: "POST", path: "/auth/login", body: { email: "ghost@company.com", password: "whatever8" } });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, "invalid_credentials");

  // 5. Change password using the session token from step 2.
  const changed = await exec.withToken(login.body.data.token, {
    method: "POST",
    path: "/auth/change-password",
    body: { currentPassword: "temp-pass-1", newPassword: "new-pass-12" }
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.ok, true);

  // 6. Re-login with the new password → mustChangePassword now false.
  const relogin = await exec.anon({ method: "POST", path: "/auth/login", body: { email: "creator1@company.com", password: "new-pass-12" } });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.data.mustChangePassword, false);
});

test("non-admin cannot create users", async () => {
  const exec = await buildTestExecutor();
  const res = await exec.asCreator({ method: "POST", path: "/admin/users", body: { email: "x@company.com", name: "X", tempPassword: "temp-pass-1" } });
  assert.equal(res.status, 403);
});
```

Also create `tests/integration/helpers/auth-native-harness.mjs` exporting `buildTestExecutor()` — it wires `createPlatformApiApp` (or the existing `executePlatformApiRequest` entry the sibling test uses) in `memory` core-persistence mode, seeds an admin user + a creator user, and returns `{ asAdmin(req), asCreator(req), anon(req), withToken(token, req) }` where each maps to the app's request executor with the appropriate headers (admin uses `x-mock-user-email: admin@company.com`; `withToken` sets the `authorization`/session header the app reads). Copy the exact wiring from `tests/integration/platform-core-api-persistence-contract.test.mjs`.

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test tests/integration/platform-auth-native-contract.test.mjs`
Expected: FAIL — routes `/admin/users`, `/auth/login`, `/auth/change-password` return 404 (not yet handled).

- [ ] **Step 4: Construct the credential service where services are assembled**

In `app-factory.ts`, where the core-persistence service is created (the `prisma`/`memory` branches around lines 210–235 returning `corePersistence`), also build the credential service from the SAME client. Locate the `CoreRepositoryBackedService` / client instance; expose the underlying `CorePersistenceClient` (the memory branch uses `new MemoryCorePersistenceClient()`, the prisma branch uses the client from `createPrismaCorePersistence`). Add:

```typescript
import { createPlatformCredentialService } from "./auth/platform-credential-service";
import { createCorePersistenceCredentialStore, createUserWithRole } from "./auth/prisma-credential-store";
```

and, after the client is created, thread `credentialService = createPlatformCredentialService(createCorePersistenceCredentialStore(client))` and the `client` onto the `services` object so handlers can reach `services.credentialService`, `services.corePersistenceClient`, and the existing session issuance. (If `createPrismaCorePersistence` does not currently return the raw client, add it to its return value alongside `service` — it constructs `new PrismaClient(...)` cast to `CorePersistenceClient`; return that too.)

- [ ] **Step 5: Add the three route handlers**

In the path-union type near lines 137–144, add `"/admin/users"`, `"/auth/login"`, `"/auth/change-password"`. Then add handlers alongside the other `if (request.method === ... && request.path === ...)` blocks:

```typescript
if (request.method === "POST" && request.path === "/admin/users") {
  const actor = services.auth.resolveCurrentUser(request.headers ?? {});
  services.auth.requireRole(actor, ["admin"]); // throws → mapped to 403 by the existing error handler
  const email = String(request.body?.email ?? "").trim().toLowerCase();
  const name = String(request.body?.name ?? "").trim();
  const role = String(request.body?.role ?? "creator");
  const tempPassword = String(request.body?.tempPassword ?? "");
  if (!email || !name) return { status: HttpStatus.BAD_REQUEST, body: failure("invalid_input") };
  const existing = await services.corePersistenceClient.platformUser.findUnique({ where: { email } });
  if (existing) return { status: HttpStatus.CONFLICT, body: failure("email_exists") };
  const id = `usr_${createHash("sha256").update(email).digest("hex").slice(0, 12)}`;
  const user = await createUserWithRole(services.corePersistenceClient, { id, email, name, role });
  const set = await services.credentialService.setPassword(id, tempPassword, { mustChange: true });
  if (!set.ok) return { status: HttpStatus.BAD_REQUEST, body: failure("weak_password") };
  services.audit?.record?.({ actorId: actor.id, action: "platform.user.created", resourceType: "platform_user", resourceId: id, metadata: { email, role } });
  const summary /*: PlatformUserSummary */ = { id: user.id, email: user.email, name: user.name, role, status: user.status, mustChangePassword: true };
  return { status: HttpStatus.CREATED, body: success(summary) };
}

if (request.method === "POST" && request.path === "/auth/login") {
  const email = String(request.body?.email ?? "");
  const password = String(request.body?.password ?? "");
  const verified = await services.credentialService.verifyLogin(email, password);
  if (!verified) return { status: HttpStatus.UNAUTHORIZED, body: failure("invalid_credentials") };
  const user = await services.corePersistence.getUserByEmail(email.trim().toLowerCase());
  const issued = services.authSso.issueNativeSession(user); // { token, expiresAt } — see note below
  services.audit?.record?.({ actorId: user.id, action: "platform.auth.login", resourceType: "platform_auth_session", resourceId: user.id, metadata: { email: user.email } });
  return { status: HttpStatus.OK, body: success({ token: issued.token, expiresAt: issued.expiresAt, mustChangePassword: verified.mustChangePassword }) };
}

if (request.method === "POST" && request.path === "/auth/change-password") {
  const actor = services.auth.resolveCurrentUser(request.headers ?? {}); // resolves the session user; throws → 401
  const currentPassword = String(request.body?.currentPassword ?? "");
  const newPassword = String(request.body?.newPassword ?? "");
  const result = await services.credentialService.changePassword(actor.id, currentPassword, newPassword);
  if (!result.ok) {
    if (result.reason === "weak_password") return { status: HttpStatus.BAD_REQUEST, body: failure("weak_password") };
    return { status: HttpStatus.BAD_REQUEST, body: failure("invalid_credentials") };
  }
  services.audit?.record?.({ actorId: actor.id, action: "platform.auth.password_changed", resourceType: "platform_user", resourceId: actor.id });
  return { status: HttpStatus.OK, body: success({ ok: true }) };
}
```

Session issuance note: add a thin `issueNativeSession(user)` on the SSO service (platform-services.ts) that reuses the exact body of `simulateLogin`'s issuance — `this.auth.issuePlatformSession(user, { sessionId: nextSessionId, issuedAt: new Date(), ttlSeconds: 3600 })`, push to `this.sessions`, return `{ token, expiresAt }`. Do NOT duplicate the SSO-provider/claims logic; the native user already exists and carries its role. Confirm the resulting token is accepted by `services.auth.resolve`/`resolveCurrentUser` so `/auth/change-password` authorizes with it. If `resolveCurrentUser` reads a mock header rather than the bearer token, use the same resolution path the rest of the authenticated API uses for session tokens (the `resolvePersistenceAuth` path at app-factory ~295 that calls `services.auth.resolve(headers)` then `corePersistence.getUserByEmail`).

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --test tests/integration/platform-auth-native-contract.test.mjs`
Expected: PASS (2 tests). Fix wiring until green (most likely adjustments: exposing `corePersistenceClient` on `services`, and the `issueNativeSession` token being accepted by the auth resolver).

- [ ] **Step 7: Verify existing tests still pass**

Run: `node --import tsx --test tests/integration/*.test.mjs tests/unit/*.test.mjs`
Expected: all previously-passing tests still pass (346+), plus the new ones.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/index.ts apps/platform-api/src/app-factory.ts apps/platform-api/src/platform-services.ts tests/integration/platform-auth-native-contract.test.mjs tests/integration/helpers/auth-native-harness.mjs
git commit -m "feat(auth): create-user, native login, change-password routes"
```

---

### Task 6: Gate simulate-login behind a dev flag

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts` (the `/admin/auth/simulate-login` handler around line 1811)
- Modify: `docker/docker-compose.yml` (platform-api env)
- Test: `tests/integration/platform-auth-native-contract.test.mjs` (add a case)

**Interfaces:**
- Consumes: env `EVCP_ALLOW_SIMULATE_LOGIN` (string; simulate-login allowed unless it is exactly `"0"`).

- [ ] **Step 1: Write the failing test (append to the native-contract test)**

Add:

```javascript
test("simulate-login is disabled when EVCP_ALLOW_SIMULATE_LOGIN=0", async () => {
  const exec = await buildTestExecutor({ env: { EVCP_ALLOW_SIMULATE_LOGIN: "0" } });
  const res = await exec.asAdmin({
    method: "POST",
    path: "/admin/auth/simulate-login",
    body: { providerId: "authprov_keycloak_default_001", subject: "s", email: "creator@company.com", name: "C", groups: ["evcp-creators"] }
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "simulate_login_disabled");
});
```

(Extend `buildTestExecutor` to accept an optional `{ env }` override forwarded to the app factory / read by the handler.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/integration/platform-auth-native-contract.test.mjs`
Expected: FAIL — simulate-login still returns 200/201.

- [ ] **Step 3: Add the flag guard**

At the top of the `/admin/auth/simulate-login` handler (app-factory.ts ~1811), before executing the login:

```typescript
if (String(env.EVCP_ALLOW_SIMULATE_LOGIN ?? "1") === "0") {
  return { status: HttpStatus.FORBIDDEN, body: failure("simulate_login_disabled") };
}
```

(Use whatever `env`/config object the factory already has in scope; default allows simulate-login so existing tests are unaffected.)

- [ ] **Step 4: Set the flag off in the pilot compose**

In `docker/docker-compose.yml`, under the `platform-api` service `environment:`, add:

```yaml
      EVCP_ALLOW_SIMULATE_LOGIN: "0"
```

- [ ] **Step 5: Run test to verify it passes + full suite**

Run: `node --import tsx --test tests/integration/platform-auth-native-contract.test.mjs`
Expected: PASS. Then run the full suite (`tests/unit/*.test.mjs tests/integration/*.test.mjs`) — still green (they don't set the flag → default allows simulate-login).

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/app-factory.ts docker/docker-compose.yml tests/integration/platform-auth-native-contract.test.mjs
git commit -m "feat(auth): gate simulate-login behind EVCP_ALLOW_SIMULATE_LOGIN, off in pilot"
```

---

### Task 7: admin-web — Users page (create Creator)

**Context:** `apps/admin-web/src/main.tsx` is a React + Vite single-file admin app using the shared `@evcp/api-client` + session store. Follow the existing page/section pattern in that file (how other admin sections issue authenticated POSTs and render lists).

**Files:**
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-users-ui.test.mjs`

**Interfaces:**
- Consumes: `POST /admin/users` → `PlatformUserSummary` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-users-ui.test.mjs` mirroring the style of `tests/unit/admin-install-wizard-ui.test.mjs` (import the pure helper functions from `main.tsx`; do not render a DOM). Test a pure helper the implementation will expose:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

const { buildCreateUserPayload, generateTempPassword } = await import("../../apps/admin-web/src/main.tsx");

test("buildCreateUserPayload trims + defaults role to creator", () => {
  const payload = buildCreateUserPayload({ email: "  New@Co.com ", name: " New ", role: "", tempPassword: "temp-pass-1" });
  assert.deepEqual(payload, { email: "new@co.com", name: "New", role: "creator", tempPassword: "temp-pass-1" });
});

test("generateTempPassword yields a >= 8 char string", () => {
  const pw = generateTempPassword();
  assert.ok(pw.length >= 8);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-users-ui.test.mjs`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the helpers + page**

In `apps/admin-web/src/main.tsx`:

(a) Export the two pure helpers near the other exported helpers:

```typescript
export function buildCreateUserPayload(input: { email: string; name: string; role: string; tempPassword: string }) {
  return {
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role.trim() || "creator",
    tempPassword: input.tempPassword
  };
}

export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
```

(b) Add a "Users" page/section with: a create form (email, name, role select defaulting to "Creator", a temp-password input with a "Generate" button calling `generateTempPassword`) that POSTs `buildCreateUserPayload(...)` to `/admin/users` via the existing api-client; on `201` it shows the temp password once in a copyable confirmation banner ("Give this to the Creator — they will change it on first login") and never re-displays it. Render server errors inline (`email_exists` → "That email already exists"; `weak_password` → "Temp password must be at least 8 characters"). Follow the existing section's styling/components.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-users-ui.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin-web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/main.tsx tests/unit/admin-users-ui.test.mjs
git commit -m "feat(admin-web): Users page to create Creator accounts"
```

---

### Task 8: creator-web — login + change-password (replace auto simulate-login)

**Context:** `apps/creator-web/src/main.tsx` is the user's ACTIVELY-EDITED, uncommitted working file containing the vibe workspace UI. **Do NOT clobber or rewrite existing code.** Integrate additively: add a login gate in front of the existing app and a change-password screen, reusing the existing session store helpers (`platformSessionToken()`, the `evcp_session` localStorage keys). The current code auto-authenticates via a `simulate-login` bridge on load — replace only that bridge call with the login gate; leave all workspace/vibe code intact.

**Files:**
- Modify: `apps/creator-web/src/main.tsx` (additive)
- Test: `tests/unit/creator-login-ui.test.mjs`

**Interfaces:**
- Consumes: `POST /auth/login` → `NativeLoginResponse`, `POST /auth/change-password` (Task 5); existing `evcp_session` store.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/creator-login-ui.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

const { persistLoginSession, needsPasswordChange } = await import("../../apps/creator-web/src/main.tsx");

test("persistLoginSession stores token + expiry", () => {
  const store = new Map();
  persistLoginSession({ token: "evcp_session.x", expiresAt: "2026-07-07T10:00:00Z", mustChangePassword: false }, {
    setItem: (k, v) => store.set(k, v)
  });
  assert.equal(store.get("evcp_session"), "evcp_session.x");
  assert.equal(store.get("evcp_session_expires_at"), "2026-07-07T10:00:00Z");
});

test("needsPasswordChange reflects the flag", () => {
  assert.equal(needsPasswordChange({ token: "t", expiresAt: "e", mustChangePassword: true }), true);
  assert.equal(needsPasswordChange({ token: "t", expiresAt: "e", mustChangePassword: false }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/creator-login-ui.test.mjs`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the helpers + login gate (additive)**

In `apps/creator-web/src/main.tsx`:

(a) Export the two pure helpers (place them near the existing session helpers, reusing the same localStorage keys the file already uses):

```typescript
export function persistLoginSession(
  res: { token: string; expiresAt: string; mustChangePassword: boolean },
  storage: { setItem: (k: string, v: string) => void } = window.localStorage
): void {
  storage.setItem("evcp_session", res.token);
  storage.setItem("evcp_session_expires_at", res.expiresAt);
}

export function needsPasswordChange(res: { mustChangePassword: boolean }): boolean {
  return res.mustChangePassword === true;
}
```

(b) Add a `LoginScreen` shown when there is no valid session (email + password → `POST /auth/login`; on failure show "Invalid email or password"; on success call `persistLoginSession`, and if `needsPasswordChange` show the change-password screen next, otherwise enter the workspace). Add a `ChangePasswordScreen` (new + confirm → `POST /auth/change-password`, then enter the workspace). Add a logout control that clears the two `evcp_session*` keys and returns to `LoginScreen`. Replace ONLY the existing auto `simulate-login` bridge invocation with this gate — do not touch the vibe/workspace rendering.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/creator-login-ui.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/creator-web && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit (coordinate with the user's uncommitted work)**

Because this file has the user's uncommitted changes, stage only this file and commit with a clear message; do NOT run `git add -A`.

```bash
git add apps/creator-web/src/main.tsx tests/unit/creator-login-ui.test.mjs
git commit -m "feat(creator-web): native login + change-password gate"
```

---

### Task 9: Live end-to-end verification

**Files:** none (verification only). Uses the running compose stack.

- [ ] **Step 1: Rebuild + restart platform-api (USER runs this — it restarts their stack)**

Surface this command for the user to run (it applies the migration, new routes, and `EVCP_ALLOW_SIMULATE_LOGIN=0`):

```bash
docker compose -f docker/docker-compose.yml up -d --build platform-api
```

- [ ] **Step 2: Create a Creator via the API (admin)**

```bash
API=http://localhost:8088/api
curl -sS -X POST "$API/admin/users" -H "x-mock-user-email: admin@company.com" -H "content-type: application/json" \
  -d '{"email":"pilot.creator@company.com","name":"Pilot Creator","role":"creator","tempPassword":"temp-pass-1"}'
```
Expected: `201` with `mustChangePassword:true`, no `passwordHash` field.

- [ ] **Step 3: Log in, change password, re-login**

```bash
curl -sS -X POST "$API/auth/login" -H "content-type: application/json" -d '{"email":"pilot.creator@company.com","password":"temp-pass-1"}'
# → token + mustChangePassword:true ; capture TOKEN, then:
curl -sS -X POST "$API/auth/change-password" -H "authorization: Bearer <TOKEN>" -H "content-type: application/json" -d '{"currentPassword":"temp-pass-1","newPassword":"new-pass-12"}'
curl -sS -X POST "$API/auth/login" -H "content-type: application/json" -d '{"email":"pilot.creator@company.com","password":"new-pass-12"}'
# → mustChangePassword:false
```
Expected: change returns `{ok:true}`; final login shows `mustChangePassword:false`.

- [ ] **Step 4: Confirm simulate-login is disabled in the pilot**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$API/admin/auth/simulate-login" -H "x-mock-user-email: admin@company.com" -H "content-type: application/json" -d '{"providerId":"authprov_keycloak_default_001","subject":"s","email":"creator@company.com","name":"C","groups":["evcp-creators"]}'
```
Expected: `403`.

- [ ] **Step 5: Browser check**

Open `http://localhost:8088/creator` → login screen appears; log in as `pilot.creator@company.com` / `new-pass-12` → workspace loads. Confirm no auto simulate-login occurs.

---

## Self-Review

**Spec coverage:**
- Data model (3 nullable columns + migration) → Task 1. ✅
- Credential service (bcryptjs, setPassword/verifyLogin/changePassword, policy, never leak) → Tasks 2–3. ✅
- Prisma persistence of credentials + create-user → Task 4. ✅
- `POST /admin/users` (admin-guard, 409/400/403, no hash) → Task 5. ✅
- `POST /auth/login` (session reuse, uniform 401) → Task 5. ✅
- `POST /auth/change-password` (session-auth, wrong_current/weak) → Task 5. ✅
- DTOs → Task 5. ✅
- simulate-login dev flag (off in pilot) → Task 6. ✅
- admin-web Users page (temp password once) → Task 7. ✅
- creator-web login + change-password, additive, logout → Task 8. ✅
- Uniform 401 / no enumeration → Task 5 test cases. ✅
- Existing 346+ tests stay green → Tasks 4/5/6 verification steps. ✅
- Audit events → Task 5 handlers. ✅
- Live verification → Task 9. ✅

**Type consistency:** `CredentialStore`/`CredentialRecord` defined in Task 3, consumed verbatim in Task 4; `PlatformCredentialService` methods identical across Tasks 3/5; DTO names (`PlatformUserSummary`, `NativeLoginResponse`) consistent Task 5 ↔ Tasks 7/8; `mustChangePassword` spelled identically throughout.

**Known adaptation points (flagged inline for the implementer, not placeholders):** exact platform-user role storage (scalar vs `PlatformUserRole` join) in Task 4/5; whether `createPrismaCorePersistence` must return the raw client; the precise auth-resolver path that accepts the issued token in Task 5. Each names the file/function to confirm against and the fallback.
