# Publish-to-Production Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Section 6 of the master spec — a Creator can Publish a project: pre-publish checks run, a production image is built from a commit, a separate production container starts, `/apps/{slug}/` is registered to it with a `WorkspaceDeployment` record + audit event, and a health-check gate decides whether traffic switches or the old version is kept.

**Architecture:** A new `apps/platform-api/src/publish/` module, composed like `workspace-orchestrator/` and `generation-loop/` (small single-responsibility files, port/adapter interfaces + `Memory*` fakes, wired in a `factory.ts`). The publish service consumes the existing `DockerEngine` (extended with a `commitContainer` capability), `buildDevContainerSpec` (a production variant is added), the generation-loop `MigrationStore`, and a new injected `GitPort` (memory-backed; real git to follow). A new `WorkspaceDeployment` record and its store are added parallel to — and deliberately NOT coupled with — the existing review-gated App Store publish domain (`PublishRequestRecord`/`PublishReview`/`DeploymentRecord` in `platform-services.ts`). A raw route registers `/apps/{slug}/` to the production container, mirroring the existing preview proxy.

**Tech Stack:** TypeScript, Node `node:http` (Docker Engine API over unix socket; health-check HTTP GET), `node --import tsx --test` `.mjs` TDD tests.

## Global Constraints

- **No approval workflow in MVP** — publish runs the automated pre-publish checks only; do NOT reuse or couple to the existing `PublishRequestRecord`/`PublishReview`/malware-gate pipeline in `platform-services.ts`. The new `WorkspaceDeployment` is a separate record in the workspace/publish domain.
- Creator never sees or manages secret values — the publish pipeline may inject `secrets.resolveEnv()` into the production container's env (same as dev), but must NEVER place secret values into deployment records, audit metadata, route responses, or logs. Only env var *names* may ever surface.
- dev and production share the SAME Postgres schema + MinIO bucket + secret set in MVP (data is not split per environment — that is a later phase). Do not provision new pg/S3 resources at publish time.
- Production container defaults: **CPU 1 core, RAM 1 GB**, `NODE_ENV=production`. It is a SEPARATE container from the dev workspace container (distinct name `evcp-prod-${slug}` vs dev `evcp-ws-${slug}`), never publishes host ports.
- Pre-publish checks (all automated, all must pass): (1) `next build` passes in the dev container, (2) no pending (unapplied) migrations, (3) git working tree clean.
- Images are retained after publish so a rollback = re-publish of an older commit's already-built image (or rebuild of that commit).
- Health-check gate: pass → switch `/apps/{slug}/` traffic to the new production container; fail → keep the previous version live and report the error (the new deployment record's `healthStatus` is `failed`).
- pg/MinIO real adapters are NOT installed (memory-backed per Plan 3) and git-commit-per-turn is a stub (per Plan 4) — the `git working tree clean` + `checkout commit` + `current commit` operations go through an injected `GitPort` with a `Memory` fake; a real git implementation follows.
- New audit event types (via the existing `onAudit` shape `{ action: string; projectId: string; metadata?: Record<string, unknown> }`): `publish`, `deploy`, `rollback`.
- Preview stays auth-gated through the reverse proxy; `/apps/{slug}/` publish routes reuse the `WorkspaceAuthContext`/`isMember` auth pattern from `workspace-orchestrator/routes.ts`.

---

### Task 1: WorkspaceDeployment type

**Files:**
- Modify: `packages/types/src/index.ts`
- Test: `tests/unit/publish-types.test.mjs`

**Interfaces:**
- Consumes: existing `EnvironmentName` (`"dev" | "staging" | "production"`) from `@evcp/types`.
- Produces: `WorkspaceDeployment` — imported by Tasks 5, 6, 8, 9.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/publish-types.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as types from "../../packages/types/src/index.ts";

test("WorkspaceDeployment record shape is constructible", () => {
  const deployment = {
    id: "dep-1",
    projectId: "proj-1",
    slug: "my-app",
    environment: "production",
    commitSha: "abc123",
    imageTag: "evcp-prod-my-app:abc123",
    containerId: "container-xyz",
    publishedByUserId: "user-1",
    healthStatus: "healthy",
    createdAt: new Date().toISOString()
  };
  assert.equal(deployment.environment, "production");
  assert.equal(deployment.healthStatus, "healthy");
  assert.ok(types); // module loads without throwing
});
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `node --import tsx --test tests/unit/publish-types.test.mjs`
Expected: PASS at runtime (object literals only; TS types have no runtime presence). Real verification is `tsc --noEmit` in Step 4.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/types/src/index.ts`:

```typescript
// --- MVP Plan 5: Publish-to-Production ---

export type DeploymentHealthStatus = "pending" | "healthy" | "failed";

export interface WorkspaceDeployment {
  id: string;
  projectId: string;
  slug: string;
  environment: EnvironmentName;
  commitSha: string;
  imageTag: string;
  containerId: string | null;
  publishedByUserId: string;
  healthStatus: DeploymentHealthStatus;
  createdAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/publish-types.test.mjs && pnpm --filter @evcp/types exec tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts tests/unit/publish-types.test.mjs
git commit -m "feat: add WorkspaceDeployment record type"
```

---

### Task 2: Git port (working-tree clean, current commit, checkout, migration file listing)

**Files:**
- Create: `apps/platform-api/src/publish/git-port.ts`
- Test: `tests/unit/git-port.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `GitPort` with `createMemoryGitPort(initial?)`:
  - `isWorkingTreeClean(projectId: string): Promise<boolean>`
  - `currentCommit(projectId: string): Promise<string>`
  - `checkoutCommit(projectId: string, commitSha: string): Promise<void>`
  - `listMigrationNames(projectId: string, commitSha: string): Promise<string[]>` (migration files present at that commit — used by the pending-migration check).
  Consumed by Tasks 5 and 8.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/git-port.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";

test("memory git port reports clean/dirty working tree per project", async () => {
  const git = createMemoryGitPort({
    "p1": { clean: true, head: "sha1", migrationNames: { sha1: ["001_init"] } }
  });
  assert.equal(await git.isWorkingTreeClean("p1"), true);
  git.state.projects["p1"].clean = false;
  assert.equal(await git.isWorkingTreeClean("p1"), false);
});

test("currentCommit returns HEAD and checkoutCommit moves HEAD", async () => {
  const git = createMemoryGitPort({ "p1": { clean: true, head: "sha1", migrationNames: {} } });
  assert.equal(await git.currentCommit("p1"), "sha1");
  await git.checkoutCommit("p1", "sha2");
  assert.equal(await git.currentCommit("p1"), "sha2");
  assert.deepEqual(git.state.projects["p1"].checkouts, ["sha2"]);
});

test("listMigrationNames returns the migration files recorded for a commit", async () => {
  const git = createMemoryGitPort({
    "p1": { clean: true, head: "sha1", migrationNames: { sha1: ["001_init", "002_users"] } }
  });
  assert.deepEqual(await git.listMigrationNames("p1", "sha1"), ["001_init", "002_users"]);
  assert.deepEqual(await git.listMigrationNames("p1", "unknown"), []);
});

test("throws for an unknown project", async () => {
  const git = createMemoryGitPort({});
  await assert.rejects(() => git.currentCommit("nope"), /no git repo/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/git-port.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/publish/git-port.ts

export interface GitPort {
  isWorkingTreeClean(projectId: string): Promise<boolean>;
  currentCommit(projectId: string): Promise<string>;
  checkoutCommit(projectId: string, commitSha: string): Promise<void>;
  listMigrationNames(projectId: string, commitSha: string): Promise<string[]>;
}

interface MemoryRepo {
  clean: boolean;
  head: string;
  migrationNames: Record<string, string[]>;
  checkouts?: string[];
}

export function createMemoryGitPort(
  initial: Record<string, MemoryRepo> = {}
): GitPort & { state: { projects: Record<string, MemoryRepo> } } {
  const state = { projects: initial };
  const repo = (projectId: string): MemoryRepo => {
    const found = state.projects[projectId];
    if (!found) {
      throw new Error(`no git repo for project '${projectId}'`);
    }
    return found;
  };
  return {
    state,
    async isWorkingTreeClean(projectId) {
      return repo(projectId).clean;
    },
    async currentCommit(projectId) {
      return repo(projectId).head;
    },
    async checkoutCommit(projectId, commitSha) {
      const r = repo(projectId);
      r.head = commitSha;
      r.checkouts = [...(r.checkouts ?? []), commitSha];
    },
    async listMigrationNames(projectId, commitSha) {
      return repo(projectId).migrationNames[commitSha] ?? [];
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/git-port.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/publish/git-port.ts tests/unit/git-port.test.mjs
git commit -m "feat: add memory git port for publish pre-checks"
```

---

### Task 3: DockerEngine commitContainer (build production image from container)

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-engine.ts`
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts`
- Test: `tests/unit/docker-engine-commit.test.mjs`

**Interfaces:**
- Consumes: existing `DockerEngine`, `createMemoryDockerEngine`, `createDockerSocketEngine`.
- Produces: `DockerEngine.commitContainer(containerId: string, imageTag: string): Promise<{ imageId: string }>` — used by Task 8 to snapshot the built dev container into a production image tag. Docker Engine API `POST /commit?container={id}&repo={repo}&tag={tag}`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/docker-engine-commit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";

const spec = {
  name: "evcp-ws-demo", image: "img", env: [],
  hostConfig: { NanoCpus: 1, Memory: 1, NetworkMode: "n", Binds: [] },
  labels: {}, exposedPort: 3000, publishPorts: false
};

test("memory docker engine records commit calls and returns an image id", async () => {
  const engine = createMemoryDockerEngine();
  const { containerId } = await engine.createContainer(spec);
  const result = await engine.commitContainer(containerId, "evcp-prod-demo:abc123");
  assert.match(result.imageId, /^mem-image-/);
  assert.deepEqual(engine.state.commits, [{ containerId, imageTag: "evcp-prod-demo:abc123" }]);
});

test("docker socket engine commitContainer posts /commit with repo+tag and returns Id", async () => {
  const calls = [];
  const request = async ({ method, path }) => {
    calls.push({ method, path });
    if (path.startsWith("/commit")) {
      return { status: 201, json: async () => ({ Id: "sha256:deadbeef" }) };
    }
    throw new Error(`unexpected path ${path}`);
  };
  const engine = createDockerSocketEngine({ request });
  const result = await engine.commitContainer("c1", "evcp-prod-demo:abc123");
  assert.equal(result.imageId, "sha256:deadbeef");
  assert.equal(calls[0].method, "POST");
  assert.match(calls[0].path, /^\/commit\?container=c1&repo=evcp-prod-demo&tag=abc123$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/docker-engine-commit.test.mjs`
Expected: FAIL — `commitContainer is not a function`

- [ ] **Step 3: Write minimal implementation**

In `docker-engine.ts`, extend the interface:

```typescript
export interface DockerEngine {
  createContainer(spec: DevContainerSpec): Promise<{ containerId: string }>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string): Promise<void>;
  removeContainer(containerId: string): Promise<void>;
  execInContainer(containerId: string, cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  commitContainer(containerId: string, imageTag: string): Promise<{ imageId: string }>;
}
```

Extend the memory fake's `state` and add the method (keep all existing methods unchanged):

```typescript
export function createMemoryDockerEngine(): DockerEngine & {
  state: {
    containers: MemoryContainer[];
    execCalls: Array<{ containerId: string; cmd: string[] }>;
    commits: Array<{ containerId: string; imageTag: string }>;
  };
} {
  const state = {
    containers: [] as MemoryContainer[],
    execCalls: [] as Array<{ containerId: string; cmd: string[] }>,
    commits: [] as Array<{ containerId: string; imageTag: string }>
  };
  // ... existing find(), createContainer, startContainer, stopContainer, removeContainer, execInContainer unchanged ...
  // add inside the returned object:
  //   async commitContainer(containerId, imageTag) {
  //     find(containerId);
  //     state.commits.push({ containerId, imageTag });
  //     return { imageId: `mem-image-${state.commits.length}` };
  //   }
}
```

(Preserve the existing `find`, `createContainer`, `startContainer`, `stopContainer`, `removeContainer`, `execInContainer` bodies exactly; only add the `commits` array to `state` and the `commitContainer` method to the returned object.)

In `docker-socket-engine.ts`, add `commitContainer` to the returned object of `createDockerSocketEngine`:

```typescript
async commitContainer(containerId, imageTag) {
  const [repo, tag] = imageTag.includes(":") ? imageTag.split(":") : [imageTag, "latest"];
  const result = await request({
    method: "POST",
    path: `/commit?container=${containerId}&repo=${repo}&tag=${tag}`
  });
  await expect("commit", result, [201]);
  const payload = await result.json();
  return { imageId: String(payload.Id) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/docker-engine-commit.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Run the existing docker engine tests to confirm no regression**

Run: `node --import tsx --test tests/unit/docker-engine-exec.test.mjs tests/unit/docker-engine-commit.test.mjs`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/docker-engine.ts apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts tests/unit/docker-engine-commit.test.mjs
git commit -m "feat: add commitContainer to DockerEngine for production image build"
```

---

### Task 4: Production container spec

**Files:**
- Modify: `apps/platform-api/src/workspace-orchestrator/docker-engine.ts`
- Test: `tests/unit/prod-container-spec.test.mjs`

**Interfaces:**
- Consumes: existing `DevContainerSpec`, `assertValidProjectSlug` (already imported in docker-engine.ts).
- Produces: `buildProdContainerSpec(input: { slug: string; image: string; env: Record<string, string>; cpuCores?: number; memoryMb?: number; network: string; workspaceVolume: string }): DevContainerSpec` — name `evcp-prod-${slug}`, env includes `NODE_ENV=production`, defaults CPU 1 / RAM 1024 MB, never publishes ports. Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/prod-container-spec.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildProdContainerSpec } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

test("prod spec uses evcp-prod- name, NODE_ENV=production, defaults CPU 1/RAM 1GB, no host ports", () => {
  const spec = buildProdContainerSpec({
    slug: "my-app",
    image: "evcp-prod-my-app:abc123",
    env: { DATABASE_URL: "postgres://x", S3_BUCKET: "proj-my-app" },
    network: "evcp-internal",
    workspaceVolume: "evcp-ws-my-app-data"
  });
  assert.equal(spec.name, "evcp-prod-my-app");
  assert.equal(spec.publishPorts, false);
  assert.equal(spec.exposedPort, 3000);
  assert.equal(spec.hostConfig.NanoCpus, 1_000_000_000);
  assert.equal(spec.hostConfig.Memory, 1024 * 1024 * 1024);
  assert.ok(spec.env.includes("NODE_ENV=production"));
  assert.ok(spec.env.includes("DATABASE_URL=postgres://x"));
  assert.equal(spec.labels["evcp.env"], "production");
});

test("prod spec honours explicit cpu/memory overrides", () => {
  const spec = buildProdContainerSpec({
    slug: "app2", image: "img", env: {}, network: "n", workspaceVolume: "v",
    cpuCores: 2, memoryMb: 2048
  });
  assert.equal(spec.hostConfig.NanoCpus, 2_000_000_000);
  assert.equal(spec.hostConfig.Memory, 2048 * 1024 * 1024);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/prod-container-spec.test.mjs`
Expected: FAIL — `buildProdContainerSpec is not exported`

- [ ] **Step 3: Write minimal implementation**

Add to `docker-engine.ts` (after `buildDevContainerSpec`):

```typescript
export function buildProdContainerSpec(input: {
  slug: string;
  image: string;
  env: Record<string, string>;
  cpuCores?: number;
  memoryMb?: number;
  network: string;
  workspaceVolume: string;
}): DevContainerSpec {
  assertValidProjectSlug(input.slug);
  const cpuCores = input.cpuCores ?? 1;
  const memoryMb = input.memoryMb ?? 1024;
  const env = { ...input.env, NODE_ENV: "production" };
  return {
    name: `evcp-prod-${input.slug}`,
    image: input.image,
    env: Object.entries(env).map(([name, value]) => `${name}=${value}`),
    hostConfig: {
      NanoCpus: Math.round(cpuCores * 1_000_000_000),
      Memory: memoryMb * 1024 * 1024,
      NetworkMode: input.network,
      Binds: [`${input.workspaceVolume}:/workspace`]
    },
    labels: { "evcp.managed": "true", "evcp.project-slug": input.slug, "evcp.env": "production" },
    exposedPort: 3000,
    publishPorts: false
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/prod-container-spec.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/workspace-orchestrator/docker-engine.ts tests/unit/prod-container-spec.test.mjs
git commit -m "feat: add production container spec builder"
```

---

### Task 5: Pre-publish checks

**Files:**
- Create: `apps/platform-api/src/publish/pre-publish-checks.ts`
- Test: `tests/unit/pre-publish-checks.test.mjs`

**Interfaces:**
- Consumes: `DockerEngine.execInContainer` (Task 3-adjacent, exists), `GitPort` (Task 2), `MigrationStore` from `../generation-loop/migration-store` (exists: `listMigrations(projectId): MigrationRecord[]`).
- Produces: `runPrePublishChecks(deps, input): Promise<PrePublishResult>` where `PrePublishResult = { ok: true } | { ok: false; failures: string[] }`. `deps = { docker: DockerEngine; git: GitPort; migrations: MigrationStore }`; `input = { projectId: string; slug: string; containerId: string; commitSha: string }`. Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/pre-publish-checks.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { runPrePublishChecks } from "../../apps/platform-api/src/publish/pre-publish-checks.ts";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

function dockerWithBuild(exitCode) {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "build log", stderr: exitCode === 0 ? "" : "build failed", exitCode };
  };
  return docker;
}

test("passes when build succeeds, tree clean, and no pending migrations", async () => {
  const git = createMemoryGitPort({ p1: { clean: true, head: "sha1", migrationNames: { sha1: ["001_init"] } } });
  const migrations = createMemoryMigrationStore();
  migrations.recordMigration({ projectId: "p1", name: "001_init", sql: "x", commitSha: "sha1" });
  const result = await runPrePublishChecks(
    { docker: dockerWithBuild(0), git, migrations },
    { projectId: "p1", slug: "app", containerId: "c1", commitSha: "sha1" }
  );
  assert.deepEqual(result, { ok: true });
});

test("fails and lists every failing check", async () => {
  const git = createMemoryGitPort({ p1: { clean: false, head: "sha1", migrationNames: { sha1: ["001_init", "002_users"] } } });
  const migrations = createMemoryMigrationStore();
  migrations.recordMigration({ projectId: "p1", name: "001_init", sql: "x", commitSha: "sha1" });
  const result = await runPrePublishChecks(
    { docker: dockerWithBuild(1), git, migrations },
    { projectId: "p1", slug: "app", containerId: "c1", commitSha: "sha1" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 3);
  assert.ok(result.failures.some((f) => /build/i.test(f)));
  assert.ok(result.failures.some((f) => /working tree/i.test(f)));
  assert.ok(result.failures.some((f) => /pending migration/i.test(f) && /002_users/.test(f)));
});

test("runs next build in the dev container", async () => {
  const docker = dockerWithBuild(0);
  const git = createMemoryGitPort({ p1: { clean: true, head: "s", migrationNames: {} } });
  await runPrePublishChecks(
    { docker, git, migrations: createMemoryMigrationStore() },
    { projectId: "p1", slug: "app", containerId: "c1", commitSha: "s" }
  );
  const buildCall = docker.state.execCalls.find((c) => c.cmd.join(" ").includes("next build"));
  assert.ok(buildCall, "expected a `next build` exec in the dev container");
  assert.equal(buildCall.containerId, "c1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/pre-publish-checks.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/publish/pre-publish-checks.ts
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { MigrationStore } from "../generation-loop/migration-store";
import type { GitPort } from "./git-port";

export type PrePublishResult = { ok: true } | { ok: false; failures: string[] };

export async function runPrePublishChecks(
  deps: { docker: DockerEngine; git: GitPort; migrations: MigrationStore },
  input: { projectId: string; slug: string; containerId: string; commitSha: string }
): Promise<PrePublishResult> {
  const failures: string[] = [];

  // 1. next build passes in the dev container
  const build = await deps.docker.execInContainer(input.containerId, ["sh", "-c", "npm run build"]);
  if (build.exitCode !== 0) {
    failures.push(`next build failed (exit ${build.exitCode}): ${build.stderr.trim()}`);
  }

  // 2. no pending (unapplied) migrations: files present at the commit but not recorded as applied
  const filesAtCommit = await deps.git.listMigrationNames(input.projectId, input.commitSha);
  const applied = new Set(deps.migrations.listMigrations(input.projectId).map((m) => m.name));
  const pending = filesAtCommit.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    failures.push(`pending migrations not applied: ${pending.join(", ")}`);
  }

  // 3. git working tree clean
  const clean = await deps.git.isWorkingTreeClean(input.projectId);
  if (!clean) {
    failures.push("git working tree is not clean");
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/pre-publish-checks.test.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/publish/pre-publish-checks.ts tests/unit/pre-publish-checks.test.mjs
git commit -m "feat: add pre-publish checks (build, migrations, clean tree)"
```

---

### Task 6: Deployment store

**Files:**
- Create: `apps/platform-api/src/publish/deployment-store.ts`
- Test: `tests/unit/deployment-store.test.mjs`

**Interfaces:**
- Consumes: `WorkspaceDeployment`, `DeploymentHealthStatus` from `@evcp/types` (Task 1).
- Produces: `DeploymentStore` with `createMemoryDeploymentStore()`:
  - `create(input: { projectId: string; slug: string; environment: EnvironmentName; commitSha: string; imageTag: string; containerId: string | null; publishedByUserId: string }): WorkspaceDeployment` (starts `healthStatus: "pending"`)
  - `updateHealth(id: string, healthStatus: DeploymentHealthStatus): WorkspaceDeployment`
  - `list(projectId: string): WorkspaceDeployment[]` (newest first)
  - `getCurrent(slug: string): WorkspaceDeployment | null` (latest healthy deployment for the slug — what `/apps/{slug}/` currently routes to)
  Consumed by Tasks 8 and 9.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/deployment-store.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

function baseInput(overrides = {}) {
  return {
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "sha1", imageTag: "evcp-prod-app:sha1", containerId: "c1",
    publishedByUserId: "u1", ...overrides
  };
}

test("create starts pending; updateHealth transitions it", () => {
  const store = createMemoryDeploymentStore();
  const dep = store.create(baseInput());
  assert.equal(dep.healthStatus, "pending");
  const updated = store.updateHealth(dep.id, "healthy");
  assert.equal(updated.healthStatus, "healthy");
  assert.equal(store.list("p1")[0].healthStatus, "healthy");
});

test("list returns newest first", () => {
  const store = createMemoryDeploymentStore();
  const d1 = store.create(baseInput({ commitSha: "sha1" }));
  const d2 = store.create(baseInput({ commitSha: "sha2" }));
  const list = store.list("p1");
  assert.deepEqual(list.map((d) => d.id), [d2.id, d1.id]);
});

test("getCurrent returns the latest HEALTHY deployment for a slug (ignores pending/failed)", () => {
  const store = createMemoryDeploymentStore();
  const d1 = store.create(baseInput({ commitSha: "sha1" }));
  store.updateHealth(d1.id, "healthy");
  const d2 = store.create(baseInput({ commitSha: "sha2" }));
  store.updateHealth(d2.id, "failed");
  const current = store.getCurrent("app");
  assert.equal(current.id, d1.id, "failed newer deployment must not become current");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/deployment-store.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/publish/deployment-store.ts
import type { WorkspaceDeployment, DeploymentHealthStatus, EnvironmentName } from "@evcp/types";

export interface DeploymentStore {
  create(input: {
    projectId: string;
    slug: string;
    environment: EnvironmentName;
    commitSha: string;
    imageTag: string;
    containerId: string | null;
    publishedByUserId: string;
  }): WorkspaceDeployment;
  updateHealth(id: string, healthStatus: DeploymentHealthStatus): WorkspaceDeployment;
  list(projectId: string): WorkspaceDeployment[];
  getCurrent(slug: string): WorkspaceDeployment | null;
}

export function createMemoryDeploymentStore(): DeploymentStore {
  const byId = new Map<string, WorkspaceDeployment>();
  const order: string[] = [];
  let counter = 0;

  return {
    create(input) {
      counter += 1;
      const deployment: WorkspaceDeployment = {
        id: `dep-${counter}`,
        projectId: input.projectId,
        slug: input.slug,
        environment: input.environment,
        commitSha: input.commitSha,
        imageTag: input.imageTag,
        containerId: input.containerId,
        publishedByUserId: input.publishedByUserId,
        healthStatus: "pending",
        createdAt: new Date().toISOString()
      };
      byId.set(deployment.id, deployment);
      order.push(deployment.id);
      return deployment;
    },
    updateHealth(id, healthStatus) {
      const existing = byId.get(id);
      if (!existing) {
        throw new Error(`unknown deployment '${id}'`);
      }
      const next = { ...existing, healthStatus };
      byId.set(id, next);
      return next;
    },
    list(projectId) {
      return order
        .map((id) => byId.get(id)!)
        .filter((dep) => dep.projectId === projectId)
        .reverse();
    },
    getCurrent(slug) {
      for (let i = order.length - 1; i >= 0; i -= 1) {
        const dep = byId.get(order[i])!;
        if (dep.slug === slug && dep.healthStatus === "healthy") {
          return dep;
        }
      }
      return null;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/deployment-store.test.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/publish/deployment-store.ts tests/unit/deployment-store.test.mjs
git commit -m "feat: add deployment store with health-gated current lookup"
```

---

### Task 7: Health checker

**Files:**
- Create: `apps/platform-api/src/publish/health-checker.ts`
- Test: `tests/unit/health-checker.test.mjs`

**Interfaces:**
- Consumes: nothing new (injectable `fetchImpl`).
- Produces: `createHttpHealthChecker(opts?: { fetchImpl?: typeof fetch; retries?: number; delayMs?: number })` with `check(url: string): Promise<boolean>`; `createMemoryHealthChecker(result: boolean)`. Consumed by Task 8. A 2xx/3xx response = healthy; network error or ≥400 = unhealthy (after retries).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/health-checker.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHttpHealthChecker, createMemoryHealthChecker } from "../../apps/platform-api/src/publish/health-checker.ts";

test("memory health checker returns the configured result", async () => {
  assert.equal(await createMemoryHealthChecker(true).check("http://x"), true);
  assert.equal(await createMemoryHealthChecker(false).check("http://x"), false);
});

test("http health checker returns true on a 200", async () => {
  const checker = createHttpHealthChecker({ fetchImpl: async () => ({ status: 200 }), retries: 1, delayMs: 0 });
  assert.equal(await checker.check("http://evcp-prod-app:3000/"), true);
});

test("http health checker returns false after exhausting retries on 5xx", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 503 };
  };
  const checker = createHttpHealthChecker({ fetchImpl, retries: 3, delayMs: 0 });
  assert.equal(await checker.check("http://x"), false);
  assert.equal(calls, 3);
});

test("http health checker treats a thrown network error as unhealthy", async () => {
  const checker = createHttpHealthChecker({
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
    retries: 2, delayMs: 0
  });
  assert.equal(await checker.check("http://x"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/health-checker.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/publish/health-checker.ts

export interface HealthChecker {
  check(url: string): Promise<boolean>;
}

export function createMemoryHealthChecker(result: boolean): HealthChecker {
  return { async check() { return result; } };
}

export function createHttpHealthChecker(opts: {
  fetchImpl?: typeof fetch;
  retries?: number;
  delayMs?: number;
} = {}): HealthChecker {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 5;
  const delayMs = opts.delayMs ?? 1000;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async check(url) {
      for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
          const response = await fetchImpl(url, { method: "GET" });
          if (response.status >= 200 && response.status < 400) {
            return true;
          }
        } catch {
          // network error — treat as not-yet-healthy, retry
        }
        if (attempt < retries - 1 && delayMs > 0) {
          await wait(delayMs);
        }
      }
      return false;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/health-checker.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/publish/health-checker.ts tests/unit/health-checker.test.mjs
git commit -m "feat: add http health checker with retries"
```

---

### Task 8: Publish service

**Files:**
- Create: `apps/platform-api/src/publish/publish-service.ts`
- Test: `tests/unit/publish-service.test.mjs`

**Interfaces:**
- Consumes: `runPrePublishChecks` (Task 5), `DockerEngine` (`execInContainer`, `commitContainer`, `createContainer`, `startContainer` — Tasks 3/4), `buildProdContainerSpec` (Task 4), `GitPort` (Task 2), `MigrationStore` (exists), `DeploymentStore` (Task 6), `HealthChecker` (Task 7), `ProjectSecretStore.resolveEnv` (exists), the existing `WorkspaceOrchestrator.getWorkspace` (for the dev container id).
- Produces: `createPublishService(deps)` with `publish(input: { projectId: string; slug: string; commitSha?: string; publishedByUserId: string }): Promise<PublishOutcome>` where `PublishOutcome = { ok: true; deployment: WorkspaceDeployment } | { ok: false; reason: "pre_checks_failed"; failures: string[] } | { ok: false; reason: "health_failed"; deployment: WorkspaceDeployment }`. `commitSha` omitted → publish current HEAD; provided → rollback/publish that commit. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/unit/publish-service.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryHealthChecker } from "../../apps/platform-api/src/publish/health-checker.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

function buildDeps({ buildExit = 0, healthy = true } = {}) {
  const docker = createMemoryDockerEngine();
  docker.execInContainer = async (containerId, cmd) => {
    docker.state.execCalls.push({ containerId, cmd });
    return { stdout: "", stderr: buildExit === 0 ? "" : "err", exitCode: buildExit };
  };
  const git = createMemoryGitPort({ p1: { clean: true, head: "sha1", migrationNames: {} } });
  const audits = [];
  return {
    docker,
    git,
    migrations: createMemoryMigrationStore(),
    deployments: createMemoryDeploymentStore(),
    health: createMemoryHealthChecker(healthy),
    resolveEnv: () => ({ DATABASE_URL: "postgres://x" }),
    getDevContainerId: () => "dev-c1",
    network: "evcp-internal",
    onAudit: (e) => audits.push(e),
    _audits: audits
  };
}

test("happy path: checks pass, image built, prod container started, healthy deployment recorded + audited", async () => {
  const deps = buildDeps();
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", publishedByUserId: "u1" });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.healthStatus, "healthy");
  assert.equal(outcome.deployment.commitSha, "sha1");
  assert.match(outcome.deployment.imageTag, /^evcp-prod-app:sha1$/);
  // built an image and started a prod container
  assert.equal(deps.docker.state.commits.length, 1);
  assert.ok(deps.docker.state.containers.some((c) => c.spec.name === "evcp-prod-app"));
  // audit events: publish + deploy
  assert.ok(deps._audits.some((e) => e.action === "workspace.publish"));
  assert.ok(deps._audits.some((e) => e.action === "workspace.deploy"));
  // secret values never appear in audit metadata
  assert.ok(!JSON.stringify(deps._audits).includes("postgres://x"));
});

test("pre-checks fail: no image built, returns failures, no deployment recorded", async () => {
  const deps = buildDeps({ buildExit: 1 });
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", publishedByUserId: "u1" });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "pre_checks_failed");
  assert.ok(outcome.failures.some((f) => /build/i.test(f)));
  assert.equal(deps.docker.state.commits.length, 0);
  assert.equal(deps.deployments.list("p1").length, 0);
});

test("health check fails: deployment recorded as failed, marked not-current", async () => {
  const deps = buildDeps({ healthy: false });
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", publishedByUserId: "u1" });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "health_failed");
  assert.equal(outcome.deployment.healthStatus, "failed");
  assert.equal(deps.deployments.getCurrent("app"), null, "a failed deploy must not become current");
});

test("rollback: publishing an explicit older commit checks out that commit and tags the image with it", async () => {
  const deps = buildDeps();
  deps.git.state.projects.p1.head = "sha2"; // HEAD is newer
  const service = createPublishService(deps);
  const outcome = await service.publish({ projectId: "p1", slug: "app", commitSha: "sha1", publishedByUserId: "u1" });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.deployment.commitSha, "sha1");
  assert.deepEqual(deps.git.state.projects.p1.checkouts, ["sha1"]);
  assert.ok(deps._audits.some((e) => e.action === "workspace.rollback"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/publish-service.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/platform-api/src/publish/publish-service.ts
import type { WorkspaceDeployment } from "@evcp/types";
import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { buildProdContainerSpec } from "../workspace-orchestrator/docker-engine";
import type { MigrationStore } from "../generation-loop/migration-store";
import type { GitPort } from "./git-port";
import type { DeploymentStore } from "./deployment-store";
import type { HealthChecker } from "./health-checker";
import { runPrePublishChecks } from "./pre-publish-checks";

export type PublishOutcome =
  | { ok: true; deployment: WorkspaceDeployment }
  | { ok: false; reason: "pre_checks_failed"; failures: string[] }
  | { ok: false; reason: "health_failed"; deployment: WorkspaceDeployment };

export interface PublishServiceDeps {
  docker: DockerEngine;
  git: GitPort;
  migrations: MigrationStore;
  deployments: DeploymentStore;
  health: HealthChecker;
  resolveEnv: (projectId: string) => Record<string, string>;
  getDevContainerId: (projectId: string) => string;
  network?: string;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
}

export function createPublishService(deps: PublishServiceDeps) {
  const network = deps.network ?? "evcp-internal";
  const audit = (action: string, projectId: string, metadata?: Record<string, unknown>) =>
    deps.onAudit?.({ action, projectId, metadata });

  return {
    async publish(input: {
      projectId: string;
      slug: string;
      commitSha?: string;
      publishedByUserId: string;
    }): Promise<PublishOutcome> {
      const isRollback = Boolean(input.commitSha);
      const devContainerId = deps.getDevContainerId(input.projectId);

      // Resolve target commit (explicit = rollback/older; else current HEAD).
      const commitSha = input.commitSha ?? (await deps.git.currentCommit(input.projectId));
      if (isRollback) {
        await deps.git.checkoutCommit(input.projectId, commitSha);
      }

      audit(isRollback ? "workspace.rollback" : "workspace.publish", input.projectId, {
        slug: input.slug,
        commitSha
      });

      // Pre-publish checks (build, migrations, clean tree) in the dev container.
      const checks = await runPrePublishChecks(
        { docker: deps.docker, git: deps.git, migrations: deps.migrations },
        { projectId: input.projectId, slug: input.slug, containerId: devContainerId, commitSha }
      );
      if (!checks.ok) {
        audit("workspace.publish_rejected", input.projectId, { slug: input.slug, failures: checks.failures });
        return { ok: false, reason: "pre_checks_failed", failures: checks.failures };
      }

      // Build the production image from the (built) dev container, tagged to the commit.
      const imageTag = `evcp-prod-${input.slug}:${commitSha}`;
      await deps.docker.commitContainer(devContainerId, imageTag);

      // Start a SEPARATE production container. Same secrets as dev + NODE_ENV=production.
      const spec = buildProdContainerSpec({
        slug: input.slug,
        image: imageTag,
        env: deps.resolveEnv(input.projectId),
        network,
        workspaceVolume: `evcp-ws-${input.slug}-data`
      });
      const { containerId } = await deps.docker.createContainer(spec);
      await deps.docker.startContainer(containerId);

      // Record the deployment (pending) before the health gate.
      const deployment = deps.deployments.create({
        projectId: input.projectId,
        slug: input.slug,
        environment: "production",
        commitSha,
        imageTag,
        containerId,
        publishedByUserId: input.publishedByUserId
      });

      // Health-check gate.
      const healthy = await deps.health.check(`http://evcp-prod-${input.slug}:3000/`);
      const finalized = deps.deployments.updateHealth(deployment.id, healthy ? "healthy" : "failed");

      if (!healthy) {
        // keep old version live; tear down the failed container (best-effort)
        await deps.docker.stopContainer(containerId).catch(() => undefined);
        await deps.docker.removeContainer(containerId).catch(() => undefined);
        audit("workspace.deploy_failed", input.projectId, { slug: input.slug, commitSha, deploymentId: finalized.id });
        return { ok: false, reason: "health_failed", deployment: finalized };
      }

      audit("workspace.deploy", input.projectId, {
        slug: input.slug,
        commitSha,
        imageTag,
        deploymentId: finalized.id
      });
      return { ok: true, deployment: finalized };
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/publish-service.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/publish/publish-service.ts tests/unit/publish-service.test.mjs
git commit -m "feat: add publish service orchestrating checks, build, deploy, health gate"
```

---

### Task 9: Publish routes + production proxy + factory + app-factory wiring

**Files:**
- Create: `apps/platform-api/src/publish/routes.ts`
- Create: `apps/platform-api/src/publish/factory.ts`
- Modify: `apps/platform-api/src/app-factory.ts`
- Test: `tests/unit/publish-routes.test.mjs`
- Test: `tests/integration/publish-apps-proxy.test.mjs`

**Interfaces:**
- Consumes: `createPublishService` (Task 8), `DeploymentStore` (Task 6), `WorkspaceAuthContext`/`isMember` pattern (`workspace-orchestrator/routes.ts`), the existing preview-proxy precedent + auth bridge in `app-factory.ts` (`services.auth.resolveCurrentUser(headers)` + `services.projects.listProjects(user)`; SINGULAR `user.role`; no `user.projectIds`).
- Produces: `createPublishRoutes(deps)` with `publish`/`rollback`/`list` returning `{ status; body }` (403 for non-members); `resolveAppsTarget(deployments, auth, slug)` returning `{ ok: true; upstream } | { ok: false; status }` used by the `/apps/{slug}/` proxy; `createDefaultPublishService(opts)` factory.

- [ ] **Step 1: Write the failing test (routes)**

```javascript
// tests/unit/publish-routes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createPublishRoutes, resolveAppsTarget } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

function fakeService(outcome) {
  return { publish: async () => outcome };
}

test("publish route rejects non-members with 403 and does not call the service", async () => {
  let called = false;
  const routes = createPublishRoutes({
    publishService: { publish: async () => { called = true; return { ok: true, deployment: {} }; } },
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["other"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test("publish route returns 201 with the deployment on success", async () => {
  const routes = createPublishRoutes({
    publishService: fakeService({ ok: true, deployment: { id: "dep-1", healthStatus: "healthy" } }),
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["p1"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 201);
  assert.equal(res.body.deployment.id, "dep-1");
});

test("publish route returns 422 with failures when pre-checks fail", async () => {
  const routes = createPublishRoutes({
    publishService: fakeService({ ok: false, reason: "pre_checks_failed", failures: ["next build failed"] }),
    deployments: createMemoryDeploymentStore()
  });
  const res = await routes.publish({ userId: "u1", roles: ["creator"], projectIds: ["p1"] }, { projectId: "p1", slug: "app" });
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.failures, ["next build failed"]);
});

test("resolveAppsTarget: 401 no auth, 404 no healthy deployment, 200 upstream when healthy", async () => {
  const deployments = createMemoryDeploymentStore();
  assert.deepEqual(await resolveAppsTarget(deployments, null, "app"), { ok: false, status: 401 });
  assert.deepEqual(await resolveAppsTarget(deployments, { userId: "u", roles: [], projectIds: [] }, "app"), { ok: false, status: 404 });

  const dep = deployments.create({
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "s", imageTag: "t", containerId: "c", publishedByUserId: "u1"
  });
  deployments.updateHealth(dep.id, "healthy");
  assert.deepEqual(await resolveAppsTarget(deployments, { userId: "u", roles: [], projectIds: [] }, "app"), {
    ok: true, upstream: "http://evcp-prod-app:3000"
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/publish-routes.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation (routes)**

```typescript
// apps/platform-api/src/publish/routes.ts
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import type { DeploymentStore } from "./deployment-store";
import type { createPublishService } from "./publish-service";

interface RouteResponse {
  status: number;
  body: Record<string, unknown>;
}

function isMember(auth: WorkspaceAuthContext, projectId: string): boolean {
  return auth.projectIds.includes(projectId);
}

export function createPublishRoutes(deps: {
  publishService: Pick<ReturnType<typeof createPublishService>, "publish">;
  deployments: DeploymentStore;
}) {
  const runPublish = async (
    auth: WorkspaceAuthContext,
    input: { projectId: string; slug: string; commitSha?: string }
  ): Promise<RouteResponse> => {
    if (!isMember(auth, input.projectId)) {
      return { status: 403, body: { error: "forbidden" } };
    }
    const outcome = await deps.publishService.publish({
      projectId: input.projectId,
      slug: input.slug,
      commitSha: input.commitSha,
      publishedByUserId: auth.userId
    });
    if (outcome.ok) {
      return { status: 201, body: { deployment: outcome.deployment } };
    }
    if (outcome.reason === "pre_checks_failed") {
      return { status: 422, body: { error: "pre_checks_failed", failures: outcome.failures } };
    }
    return { status: 502, body: { error: "health_failed", deployment: outcome.deployment } };
  };

  return {
    publish(auth: WorkspaceAuthContext, input: { projectId: string; slug: string }): Promise<RouteResponse> {
      return runPublish(auth, input);
    },
    rollback(
      auth: WorkspaceAuthContext,
      input: { projectId: string; slug: string; commitSha: string }
    ): Promise<RouteResponse> {
      return runPublish(auth, input);
    },
    list(auth: WorkspaceAuthContext, input: { projectId: string }): RouteResponse {
      if (!isMember(auth, input.projectId)) {
        return { status: 403, body: { error: "forbidden" } };
      }
      return { status: 200, body: { deployments: deps.deployments.list(input.projectId) } };
    }
  };
}

export type AppsResolution = { ok: true; upstream: string } | { ok: false; status: 401 | 404 | 503 };

export async function resolveAppsTarget(
  deployments: DeploymentStore,
  auth: WorkspaceAuthContext | null,
  slug: string
): Promise<AppsResolution> {
  if (!auth) {
    return { ok: false, status: 401 };
  }
  const current = deployments.getCurrent(slug);
  if (!current) {
    return { ok: false, status: 404 };
  }
  return { ok: true, upstream: `http://evcp-prod-${slug}:3000` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/publish-routes.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Write the factory**

```typescript
// apps/platform-api/src/publish/factory.ts
import { createPublishService } from "./publish-service";
import { createMemoryGitPort } from "./git-port";
import { createMemoryDeploymentStore, type DeploymentStore } from "./deployment-store";
import { createHttpHealthChecker } from "./health-checker";
import { createMemoryMigrationStore } from "../generation-loop/migration-store";
import type { WorkspaceOrchestrator } from "../workspace-orchestrator/orchestrator";

// Shared deployment store so routes + /apps proxy read the same deployments.
export function createDefaultPublishStack(opts: {
  orchestrator: WorkspaceOrchestrator;
  onAudit?: (event: { action: string; projectId: string; metadata?: Record<string, unknown> }) => void;
}): { publishService: ReturnType<typeof createPublishService>; deployments: DeploymentStore } {
  const deployments = createMemoryDeploymentStore();

  // NOTE: DockerEngine, GitPort, and MigrationStore are memory-backed placeholders here.
  // Real publish requires the SAME DockerEngine instance the orchestrator uses, a real
  // git implementation, and the shared MigrationStore from the generation loop. Those are
  // threaded in a follow-up (see Plan 4's DockerEngine-wiring follow-up). Until then, the
  // publish routes are reachable and fully unit-tested, but a real container publish is latent.
  const docker = {
    execInContainer: async () => ({ stdout: "", stderr: "publish docker not wired", exitCode: 1 }),
    commitContainer: async () => { throw new Error("publish docker not wired"); },
    createContainer: async () => { throw new Error("publish docker not wired"); },
    startContainer: async () => {},
    stopContainer: async () => {},
    removeContainer: async () => {}
  } as never;

  const publishService = createPublishService({
    docker,
    git: createMemoryGitPort({}),
    migrations: createMemoryMigrationStore(),
    deployments,
    health: createHttpHealthChecker(),
    resolveEnv: () => ({}),
    getDevContainerId: (projectId) => {
      const workspace = opts.orchestrator.getWorkspace(projectId);
      if (!workspace?.containerId) {
        throw new Error(`no dev container for project '${projectId}'`);
      }
      return workspace.containerId;
    },
    onAudit: opts.onAudit
  });

  return { publishService, deployments };
}
```

- [ ] **Step 6: Write the failing integration test (apps proxy resolution)**

```javascript
// tests/integration/publish-apps-proxy.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppsTarget } from "../../apps/platform-api/src/publish/routes.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";

test("/apps/{slug} resolution gates on a healthy deployment and auth", async () => {
  const deployments = createMemoryDeploymentStore();
  const auth = { userId: "u1", roles: ["creator"], projectIds: ["p1"] };

  // no deployment yet
  assert.equal((await resolveAppsTarget(deployments, auth, "app")).ok, false);

  // pending deployment does not route
  const dep = deployments.create({
    projectId: "p1", slug: "app", environment: "production",
    commitSha: "s1", imageTag: "evcp-prod-app:s1", containerId: "c1", publishedByUserId: "u1"
  });
  assert.equal((await resolveAppsTarget(deployments, auth, "app")).ok, false);

  // healthy deployment routes to the production container
  deployments.updateHealth(dep.id, "healthy");
  const resolved = await resolveAppsTarget(deployments, auth, "app");
  assert.deepEqual(resolved, { ok: true, upstream: "http://evcp-prod-app:3000" });

  // no auth → 401
  assert.deepEqual(await resolveAppsTarget(deployments, null, "app"), { ok: false, status: 401 });
});
```

- [ ] **Step 7: Run test to verify it fails, then passes**

Run: `node --import tsx --test tests/integration/publish-apps-proxy.test.mjs`
Expected: PASS (the resolver already exists from Step 3; this test locks the `/apps` behavior).

- [ ] **Step 8: Wire into `app-factory.ts`**

`app-factory.ts` (NestJS over Express) already has a raw `/apps/*` handling concern and a preview-proxy precedent. Wire the publish routes into the synchronous dispatcher (they are request/response, not streaming) and add an authenticated `/apps/:slug/*` reverse proxy to the current production container, mirroring the existing `previewHandler` at ~line 2126.

**IMPORTANT — the implementer must first grep `app-factory.ts` for the exact landmarks (do not guess names):**
- The preview handler + `rawApp` acquisition (`app.getHttpAdapter().getInstance()`, `rawApp.all("/preview/:slug", previewHandler)`).
- The auth bridge used by `resolvePreviewProxyDecision` (~line 268): `services.auth.resolveCurrentUser(headers)` + `services.projects.listProjects(user).map((p) => p.id)`; `user.role` is SINGULAR.
- Whether Caddy already routes `/apps/*` to `platform-api` (docker/Caddyfile line ~15 rewrites `/apps/*` to the app-store PWA today — the production-app proxy must take precedence for slugs that have a healthy deployment; coordinate the path so app-store PWA routes still work for non-deployed slugs, OR mount the production proxy under the existing `/apps/:slug` and fall through to the PWA when `resolveAppsTarget` returns 404. Document the chosen precedence in the report; do NOT silently break the existing app-store `/apps/*` route.).

Add near the preview-handler block:

```typescript
// apps/platform-api/src/app-factory.ts (excerpt — adapt names to the real file)
import { createPublishRoutes, resolveAppsTarget } from "./publish/routes";
import { createDefaultPublishStack } from "./publish/factory";

// where other stacks are constructed:
const { publishService, deployments: workspaceDeployments } = createDefaultPublishStack({
  orchestrator: services.workspaceOrchestrator,
  onAudit: services.onAudit
});
const publishRoutes = createPublishRoutes({ publishService, deployments: workspaceDeployments });

// Dispatch (synchronous request/response) — mount POST /projects/:id/publish, POST /projects/:id/rollback,
// GET /projects/:id/deployments, resolving WorkspaceAuthContext via the same bridge resolvePreviewProxyDecision uses.

// Raw authenticated production proxy for healthy deployments (mirror previewHandler):
const appsProdHandler = async (req: PreviewReq, res: PreviewRes) => {
  const slug = String(req.params?.slug ?? "");
  let auth: WorkspaceAuthContext | null = null;
  try {
    const user = services.auth.resolveCurrentUser(req.headers ?? {});
    const projectIds = services.projects.listProjects(user).map((project) => project.id);
    auth = { userId: user.id, roles: user.role ? [user.role] : [], projectIds };
  } catch {
    auth = null;
  }
  const decision = await resolveAppsTarget(workspaceDeployments, auth, slug);
  if (!decision.ok) {
    // 404 → fall through to the existing app-store PWA route rather than hard-erroring
    res.status(decision.status).json({ error: "app_unavailable" });
    return;
  }
  // ... same reverse-proxy body as previewHandler, forwarding to decision.upstream,
  //     stripping Authorization/Cookie before forwarding to the tenant-authored upstream ...
};
```

Because the SSE and preview precedents show the raw-route + auth-bridge pattern, keep this handler consistent: strip `Authorization`/`Cookie` from forwarded headers (as the preview proxy does), never publish host ports, and never place secret values in any response.

- [ ] **Step 9: Run the full suite**

Run: `node --import tsx --test tests/unit/*.test.mjs tests/integration/*.test.mjs`
Expected: all PASS, no regressions. Then `cd apps/platform-api && npx tsc --noEmit` → zero errors.

- [ ] **Step 10: Commit**

```bash
git add apps/platform-api/src/publish/routes.ts apps/platform-api/src/publish/factory.ts apps/platform-api/src/app-factory.ts tests/unit/publish-routes.test.mjs tests/integration/publish-apps-proxy.test.mjs
git commit -m "feat: add publish routes, production apps proxy, and app-factory wiring"
```

---

## Notes for the implementer wiring Task 9 into `app-factory.ts`

- `app-factory.ts` is large (~2700 lines) and has PRE-EXISTING uncommitted working-tree changes (concurrent UI/PRD work). Stage only your hunks with `git add -p`; never `git add` the whole file. Verify with `git status --short` that pre-existing changes remain unstaged after committing.
- `commitContainer` (Task 3) snapshots the *dev* container into the production image tag. This is the MVP-honest primitive (`docker commit`) standing in for a full `next build --standalone` image build; the pre-publish check already runs `next build` in the dev container first, so the committed image contains the built artifact. A dedicated Dockerfile/`/build` image pipeline is a documented follow-up.
- The `createDefaultPublishStack` factory intentionally ships a throwing docker placeholder and memory git/migration stores — real publish requires threading the orchestrator's shared `DockerEngine`, a real `GitPort`, and the generation loop's shared `MigrationStore`. This mirrors Plan 4's DockerEngine-wiring follow-up; call it out in the report as DONE_WITH_CONCERNS, not a silent gap. Routes + `/apps` resolution are fully unit-tested regardless.
- Coordinate `/apps/:slug` precedence with the existing app-store PWA route (docker/Caddyfile) so non-deployed slugs still reach the PWA; do not break the existing route.
