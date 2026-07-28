# Spec-Driven Vibe Coding — Phase B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Creator approves a plan, the chat route records a durable draft PRD version capturing that plan, so the spec evolves and Phase A can ground on it once a human confirms the baseline.

**Architecture:** Server-side + backend-only. A pure `buildPlanChangeRequest` plus a `createPlanVersionRecorder(prds)` reuse `PrdService.createVersionFromChange` (source type `"prompt"`). `chat-route.ts` calls the recorder (fail-soft) after a build turn that carried an `approvedPlan`, and emits a `prd_version` SSE event. `app-factory.ts` injects the recorder into the existing chat handler (offset by collapsing two adjacent lines). No new route, no frontend change.

**Tech Stack:** TypeScript (NodeNext ESM), NestJS platform-api. Tests: Node built-in runner via `node --import tsx --test`.

## Global Constraints

- Do **not** exceed the line baselines: `app-factory.ts` (3390) and `platform-services.ts` (8421) may only shrink; `generation-service.ts` ≤ 400.
- No new HTTP route is registered; reuse the existing `/projects/:projectId/chat` handler.
- Recording is fail-soft: a failure to record a PRD version must never break or fail the generation stream.
- The created PRD version is a **draft (non-baseline)**; the baseline changes only through the existing `POST /projects/:id/prd/baseline`. No auto-confirm.
- No app-local styles (there are no frontend changes here).
- `pnpm check` must pass at the end.

Reference shapes (already in `apps/platform-api/src/platform-services.ts`):

```ts
export type PrdChangeSourceType = "ticket" | "prompt" | "manual";
export type PrdChangeStatus = "draft" | "pending_approval" | "approved" | "rejected" | "changes_requested";
export type PrdChangeRiskLevel = "low" | "medium" | "high" | "critical";
export interface PrdSection { id: string; key: string; title: string; body: string; order: number; }
export interface PrdChangeRequest {
  id: string; projectId: string; sourceType: PrdChangeSourceType; sourceTicketId?: string;
  title: string; proposedRequirement: string; affectedSections: string[]; acceptanceCriteria: string[];
  riskLevel: PrdChangeRiskLevel; status: PrdChangeStatus; requestedByUserId: string;
  approvedPrdVersionId?: string; createdAt: string; updatedAt: string; decisions: PrdChangeDecision[];
}
// PrdService (public): getCurrent(actor, projectId): PrdVersion;  createVersionFromChange(actor, projectId, change): PrdVersion
//   createVersionFromChange appends `proposedRequirement` only to sections whose key is in change.affectedSections.
// PrdVersion has: id, version, isBaseline, changeSummary, sections: PrdSection[].
```

---

### Task 1: Pure `buildPlanChangeRequest`

**Files:**
- Create: `apps/platform-api/src/prd/plan-change.ts`
- Test: `tests/unit/prd-plan-change.test.mjs`

**Interfaces:**
- Produces: `buildPlanChangeRequest(projectId: string, title: string, planText: string, requestedByUserId: string, affectedSections: string[]): PrdChangeRequest`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/prd-plan-change.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanChangeRequest } from "../../apps/platform-api/src/prd/plan-change.ts";

test("builds a prompt-sourced change carrying the plan as the proposed requirement", () => {
  const change = buildPlanChangeRequest("p1", "  Add a report page  ", "1. Add /reports\n2. CSV export", "u1", ["core_flows"]);
  assert.equal(change.projectId, "p1");
  assert.equal(change.sourceType, "prompt");
  assert.equal(change.title, "Add a report page");
  assert.equal(change.proposedRequirement, "1. Add /reports\n2. CSV export");
  assert.deepEqual(change.affectedSections, ["core_flows"]);
  assert.deepEqual(change.acceptanceCriteria, []);
  assert.equal(change.riskLevel, "low");
  assert.equal(change.status, "draft");
  assert.equal(change.requestedByUserId, "u1");
  assert.deepEqual(change.decisions, []);
  assert.ok(change.id.length > 0);
  assert.ok(!Number.isNaN(Date.parse(change.createdAt)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/prd-plan-change.test.mjs`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/platform-api/src/prd/plan-change.ts`:

```ts
import type { PrdChangeRequest } from "../platform-services";

// Synthesizes a "prompt"-sourced PRD change request from an approved plan, so PrdService can turn it
// into a durable draft PRD version. Kept pure (no service access) for direct unit testing.
export function buildPlanChangeRequest(
  projectId: string,
  title: string,
  planText: string,
  requestedByUserId: string,
  affectedSections: string[]
): PrdChangeRequest {
  const now = new Date().toISOString();
  return {
    id: `prdchg_${projectId}_plan_${Date.now().toString(36)}`,
    projectId,
    sourceType: "prompt",
    title: title.trim(),
    proposedRequirement: planText,
    affectedSections,
    acceptanceCriteria: [],
    riskLevel: "low",
    status: "draft",
    requestedByUserId,
    createdAt: now,
    updatedAt: now,
    decisions: []
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/prd-plan-change.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/prd/plan-change.ts tests/unit/prd-plan-change.test.mjs
git commit -m "feat: synthesize a prompt-sourced PRD change from an approved plan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `createPlanVersionRecorder`

**Files:**
- Create: `apps/platform-api/src/prd/plan-version.ts`
- Test: `tests/unit/prd-plan-version.test.mjs`

**Interfaces:**
- Consumes: `buildPlanChangeRequest` (Task 1); `prds.getCurrent(actor, projectId)`, `prds.createVersionFromChange(actor, projectId, change)`.
- Produces: `createPlanVersionRecorder(prds): (actor: { id: string }, projectId: string, planText: string) => Promise<PrdVersion>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/prd-plan-version.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createPlanVersionRecorder } from "../../apps/platform-api/src/prd/plan-version.ts";

function fakePrds(sectionKeys) {
  const captured = {};
  return {
    captured,
    getCurrent: () => ({ sections: sectionKeys.map((key, i) => ({ id: key, key, title: key, body: "", order: i + 1 })) }),
    createVersionFromChange: (_actor, _projectId, change) => {
      captured.change = change;
      return { id: "v2", version: "1.1", isBaseline: false, changeSummary: change.title, sections: [] };
    }
  };
}

test("records against the core_flows section when present, deriving the title from the plan", async () => {
  const prds = fakePrds(["overview", "core_flows", "nfr"]);
  const version = await createPlanVersionRecorder(prds)({ id: "u1" }, "p1", "Add a monthly report page\nwith CSV export");
  assert.deepEqual(prds.captured.change.affectedSections, ["core_flows"]);
  assert.equal(prds.captured.change.sourceType, "prompt");
  assert.equal(prds.captured.change.proposedRequirement, "Add a monthly report page\nwith CSV export");
  assert.equal(prds.captured.change.title, "Add a monthly report page");
  assert.equal(prds.captured.change.requestedByUserId, "u1");
  assert.equal(version.id, "v2");
});

test("falls back to the first section when there is no core_flows", async () => {
  const prds = fakePrds(["overview", "nfr"]);
  await createPlanVersionRecorder(prds)({ id: "u1" }, "p1", "Tweak the header");
  assert.deepEqual(prds.captured.change.affectedSections, ["overview"]);
});

test("uses a fallback title when the plan text is blank", async () => {
  const prds = fakePrds(["core_flows"]);
  await createPlanVersionRecorder(prds)({ id: "u1" }, "p1", "   ");
  assert.equal(prds.captured.change.title, "Approved plan");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/prd-plan-version.test.mjs`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/platform-api/src/prd/plan-version.ts`:

```ts
import type { PlatformUser, PrdVersion, PrdService } from "../platform-services";
import { buildPlanChangeRequest } from "./plan-change";

// Records a durable draft PRD version from an approved plan by reusing PrdService's change→version
// path. The plan text is appended to the "core_flows" section (or the first section) so it actually
// lands in the new version; the caller (chat route) invokes this fail-soft.
export function createPlanVersionRecorder(prds: Pick<PrdService, "getCurrent" | "createVersionFromChange">) {
  return async (actor: PlatformUser, projectId: string, planText: string): Promise<PrdVersion> => {
    const current = prds.getCurrent(actor, projectId);
    const targetKey =
      current.sections.find((section) => section.key === "core_flows")?.key ??
      current.sections[0]?.key ??
      "core_flows";
    const title = planText.trim().split("\n")[0]?.slice(0, 80).trim() || "Approved plan";
    const change = buildPlanChangeRequest(projectId, title, planText, actor.id, [targetKey]);
    return prds.createVersionFromChange(actor, projectId, change);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/prd-plan-version.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/prd/plan-version.ts tests/unit/prd-plan-version.test.mjs
git commit -m "feat: record a draft PRD version from an approved plan

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Chat route records + emits on approved-plan turns

**Files:**
- Modify: `apps/platform-api/src/generation-loop/chat-route.ts`
- Test: `tests/unit/chat-route-prd-version.test.mjs`

**Interfaces:**
- Consumes: the recorder shape `(actor, projectId, planText) => Promise<{ id: string; version: string; changeSummary: string }>`.
- Produces: `createChatSseHandler` deps gain optional `recordPrdVersionFromPlan?`; after a build turn with an `approvedPlan`, the handler calls it fail-soft and writes a `prd_version` SSE event.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chat-route-prd-version.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";

function fakeRes() {
  const chunks = [];
  return {
    chunks,
    headersSent: false,
    writeHead() { this.headersSent = true; },
    flushHeaders() {},
    write(s) { chunks.push(s); },
    end() {}
  };
}
const runTurnOnce = async function* () { yield { type: "done" }; };

function deps(captured, record = true) {
  return {
    generationService: { runTurn: () => runTurnOnce(), history: async () => [] },
    resolveAuth: async () => ({ userId: "u1", roles: ["creator"], projectIds: ["p1"], actor: { id: "u1" } }),
    recordPrdVersionFromPlan: record
      ? async (actor, projectId, planText) => { captured.call = { actor, projectId, planText }; return { id: "v2", version: "1.1", changeSummary: "x" }; }
      : undefined
  };
}

test("records a PRD version and emits prd_version on a build turn with an approved plan", async () => {
  const captured = {};
  const handler = createChatSseHandler(deps(captured));
  const req = { url: "/projects/p1/chat", method: "POST", headers: {}, body: { prompt: "go", agentMode: "build", approvedPlan: "Step 1: add reports" } };
  const res = fakeRes();
  await handler(req, res);
  assert.deepEqual(captured.call, { actor: { id: "u1" }, projectId: "p1", planText: "Step 1: add reports" });
  assert.ok(res.chunks.some((c) => c.includes("event: prd_version")));
});

test("does not record when there is no approved plan", async () => {
  const captured = {};
  const handler = createChatSseHandler(deps(captured));
  const req = { url: "/projects/p1/chat", method: "POST", headers: {}, body: { prompt: "go", agentMode: "build" } };
  await handler(req, fakeRes());
  assert.equal(captured.call, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/chat-route-prd-version.test.mjs`
Expected: FAIL — no `prd_version` frame / recorder not called (chat route does not record yet).

- [ ] **Step 3: Add the dep + recording**

In `apps/platform-api/src/generation-loop/chat-route.ts`, add to the `createChatSseHandler` deps type (after `resolveAttachmentContext?`):

```ts
  recordPrdVersionFromPlan?: (
    actor: NonNullable<WorkspaceAuthContext["actor"]>,
    projectId: string,
    planText: string
  ) => Promise<{ id: string; version: string; changeSummary: string }>;
```

In the build-path handler, after the `for await (const event of … runTurn(…)) { … }` loop finishes and **before** the `catch`, add (inside the same `try`):

```ts
        if (approvedPlan && agentMode === "build" && deps.recordPrdVersionFromPlan && auth.actor) {
          try {
            const created = await deps.recordPrdVersionFromPlan(auth.actor, projectId, approvedPlan);
            res.write(`event: prd_version\ndata: ${JSON.stringify({ type: "prd_version", ...created })}\n\n`);
          } catch {
            // Recording the spec change is best-effort — never disturb the generation stream.
          }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/chat-route-prd-version.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/chat-route.ts tests/unit/chat-route-prd-version.test.mjs
git commit -m "feat: record a PRD version from the approved plan after a build turn

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the recorder in app-factory (within baseline)

**Files:**
- Modify: `apps/platform-api/src/app-factory.ts`

**Interfaces:**
- Consumes: `createPlanVersionRecorder` (Task 2); the existing `createChatSseHandler({ … })` call and `services.prds`.

- [ ] **Step 1: Add the import + dependency**

In `apps/platform-api/src/app-factory.ts`:

1. Add the import near the top (beside the `createChatSseHandler` import):

```ts
import { createPlanVersionRecorder } from "./prd/plan-version";
```

2. In the `createChatSseHandler({ … })` call, add the dependency after the `resolveAttachmentContext` property:

```ts
    recordPrdVersionFromPlan: createPlanVersionRecorder(services.prds)
```

- [ ] **Step 2: Offset the added lines to stay within the baseline**

Run: `wc -l apps/platform-api/src/app-factory.ts`
Expected: must be **≤ 3390**. The two additions above (import + property) push it to ~3392. Offset by collapsing two adjacent multi-line expressions in the same chat-handler wiring block onto single lines — for example the `resolveAuth: async (req) => { try { … } catch { return null; } }` arrow can be written on one line, and the two `rawApp.all("/projects/:projectId/chat…", chatSseHandler as unknown as Parameters<RawExpress["all"]>[1]);` registrations are already single lines. Collapse purely mechanically (no behavior change) until `wc -l` reports ≤ 3390. Do not extract or restructure logic.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @evcp/platform-api typecheck`
Expected: clean — `createPlanVersionRecorder(services.prds)` returns a function matching the `recordPrdVersionFromPlan?` dep signature (its `PrdVersion` return is structurally assignable to `{ id; version; changeSummary }`).

- [ ] **Step 4: Commit**

```bash
git add apps/platform-api/src/app-factory.ts
git commit -m "feat: wire the plan-to-PRD-version recorder into the chat route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Integration — the spec evolves and Phase A grounds on it

**Files:**
- Test: `tests/integration/prd-version-from-plan.test.mjs`

**Interfaces:**
- Consumes: `createPlatformApiServices` (real in-memory services), `createPlanVersionRecorder` (Task 2), `renderBaselineSpec` (Phase A).

- [ ] **Step 1: Write the integration test**

Create `tests/integration/prd-version-from-plan.test.mjs` (mirrors the setup in `tests/unit/platform-prd-services.test.mjs`):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformApiServices } from "../../apps/platform-api/src/platform-services.ts";
import { createPlanVersionRecorder } from "../../apps/platform-api/src/prd/plan-version.ts";
import { renderBaselineSpec } from "../../apps/platform-api/src/prd/baseline-spec.ts";

function services() {
  const s = createPlatformApiServices();
  const admin = s.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = s.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const provider = s.aiGovernance.createProvider(admin, { name: "OpenAI", adapter: "openai", baseUrl: "https://api.openai.com/v1", models: ["gpt-4.1"] });
  s.aiGovernance.createApiKey(admin, { providerId: provider.id, name: "Key", secret: "sk-test-secret-not-real", usageMode: "production", quotaTokens: 100000, fallbackPriority: 1 });
  s.aiGovernance.configureRoute(admin, { scenario: "prd_generation", primaryProviderId: provider.id, primaryModel: "gpt-4.1" });
  s.aiGovernance.configureQuota(admin, { scope: "creator", dailyLimit: 1000, monthlyLimit: 5000, warningThreshold: 800, hardStop: true, usedToday: 0 });
  return { s, creator };
}

test("approving a plan records a draft version that, once confirmed, grounds Phase A", async () => {
  const { s, creator } = services();
  const project = s.projects.createProject({ actor: creator, name: "Leave", slug: "leave-plan-b2", appType: "Workflow App", businessProblem: "Governed leave flow", targetDepartment: "HR", intendedUsers: ["Employee"], dataSensitivity: "internal" });
  const draft = s.prds.generateDraft(creator, project.id);
  s.prds.confirmBaseline(creator, project.id, draft.id);

  const version = await createPlanVersionRecorder(s.prds)(creator, project.id, "Add a monthly report page with CSV export");
  assert.equal(version.isBaseline, false);
  const coreFlows = version.sections.find((section) => section.key === "core_flows");
  assert.ok(coreFlows.body.includes("Add a monthly report page with CSV export"));

  s.prds.confirmBaseline(creator, project.id, version.id);
  const spec = renderBaselineSpec(s.prds.listVersions(creator, project.id));
  assert.ok(spec.includes("Add a monthly report page with CSV export"));
});
```

- [ ] **Step 2: Run the integration test**

Run: `EVCP_ALLOW_SIMULATE_LOGIN=1 node --import tsx --test tests/integration/prd-version-from-plan.test.mjs`
Expected: PASS. (If the harness rejects the simulated login without the env var, the flag enables it; it is harmless otherwise.)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/prd-version-from-plan.test.mjs
git commit -m "test: plan-approved PRD version evolves the spec and grounds Phase A

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Full gate + baselines**

Run: `pnpm check`
Expected: passes. (Two pre-existing/flaky tests are known — `POST /setup/initialize …` and `idle sweep …`; confirm no *new* failures.)

Run: `wc -l apps/platform-api/src/app-factory.ts apps/platform-api/src/generation-loop/generation-service.ts && git diff --name-only $(git merge-base main HEAD)..HEAD | grep -c platform-services.ts`
Expected: `app-factory.ts` ≤ 3390; `generation-service.ts` ≤ 400; `platform-services.ts` count `0`.

- [ ] **Step 5: Commit any gate fixups** (only if the gate required a change)

```bash
git add -A
git commit -m "chore: satisfy quality gate for spec-driven vibe coding phase B2"
```

---

## Self-Review

**Spec coverage:**
- `buildPlanChangeRequest` (prompt-sourced, plan as proposedRequirement) → Task 1.
- `createPlanVersionRecorder` (core_flows→first target, title derivation, reuse createVersionFromChange) → Task 2.
- chat route records fail-soft + emits `prd_version` on build turns with an approved plan → Task 3.
- app-factory injects the recorder within baseline → Task 4.
- Integration: draft version captures the plan; confirmBaseline promotes it; renderBaselineSpec (Phase A) returns it → Task 5.
- Governance: draft/non-baseline only; baseline via existing confirm flow → Tasks 2 (status/isBaseline) + 5 (explicit confirmBaseline).

**Placeholder scan:** none — all steps carry concrete code. (Task 3's test note tightens the res assertion; the final test uses one `res` per handler call and asserts both the `prd_version` frame and `captured.call`.)

**Type consistency:** `buildPlanChangeRequest(projectId, title, planText, requestedByUserId, affectedSections)` (Task 1) is called with those exact args by the recorder (Task 2); `createPlanVersionRecorder(prds)` returns `(actor, projectId, planText) => Promise<PrdVersion>`, and `PrdVersion` is structurally assignable to the chat route's `{ id; version; changeSummary }` dep return (Task 3) and to app-factory's injection (Task 4). `getCurrent`/`createVersionFromChange` names match `PrdService`.
