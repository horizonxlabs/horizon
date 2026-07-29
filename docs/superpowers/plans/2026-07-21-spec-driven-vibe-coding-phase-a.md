# Spec-Driven Vibe Coding — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject the project's confirmed PRD baseline into the generation system prompt as governed context, so vibe coding builds toward the approved spec.

**Architecture:** Add a `productSpec` string to the existing `GovernedContext`. A new pure helper renders the confirmed baseline's PRD sections to Markdown from `PrdService.listVersions` output (public, no change to the frozen `platform-services.ts`). The resolver adds it to the context; `buildSystemPrompt` renders a `## Product spec` section; `generation-service` passes it through — all extending the skills/knowledge path shipped this session.

**Tech Stack:** TypeScript (NodeNext ESM), NestJS platform-api. Tests: Node built-in test runner run via `node --import tsx --test tests/unit/<file>.test.mjs`.

## Global Constraints

- `apps/platform-api/src/generation-loop/generation-service.ts` must stay **≤ 400 lines** (it is currently at 400; the only change here is one added object field — keep it at ≤ 400 by the compensating note in Task 4).
- Do **not** modify `apps/platform-api/src/platform-services.ts` (grandfathered at its line ceiling). Use only its existing public `PrdService.listVersions(actor, projectId): PrdVersion[]`.
- New spec section is clipped to **8000 characters**; append `\n… (spec truncated)` when clipped.
- `pnpm check` (typecheck, lint `oxlint --deny-warnings`, design-system, unit tests) must pass. Tests run with `EVCP_ALLOW_SIMULATE_LOGIN=1` when they build platform services.
- Fail-soft: a missing/failed PRD read must never break generation (match the skills/knowledge `try/catch` in `governed-context.ts`).

Reference types (already defined in `apps/platform-api/src/platform-services.ts`, import as types only):

```ts
export interface PrdSection { id: string; key: string; title: string; body: string; order: number; }
export interface PrdVersion {
  id: string; projectId: string; version: string; status: "draft" | "baseline";
  isBaseline: boolean; sourcePrompt: string; changeSummary: string;
  generatedBy: { scenario: AiScenario; providerId: string; model: string };
  sections: PrdSection[]; createdByUserId: string; createdAt: string;
}
```

---

### Task 1: Render the confirmed PRD baseline to Markdown

**Files:**
- Create: `apps/platform-api/src/prd/baseline-spec.ts`
- Test: `tests/unit/prd-baseline-spec.test.mjs`

**Interfaces:**
- Consumes: `PrdVersion` (type) from `../platform-services`.
- Produces: `renderBaselineSpec(versions: PrdVersion[]): string | null` — returns the baseline version's sections rendered to Markdown (sorted ascending by `section.order`, each `## {title}\n{body}`), clipped to 8000 chars with a `\n… (spec truncated)` suffix when over; returns `null` when no version has `isBaseline === true`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/prd-baseline-spec.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderBaselineSpec } from "../../apps/platform-api/src/prd/baseline-spec.ts";

const version = (over = {}) => ({
  id: "v1", projectId: "p1", version: "1.0.0", status: "baseline", isBaseline: true,
  sourcePrompt: "", changeSummary: "", generatedBy: { scenario: "prd_generation", providerId: "x", model: "y" },
  sections: [
    { id: "s2", key: "req", title: "Requirements", body: "Must track income and expense.", order: 2 },
    { id: "s1", key: "overview", title: "Overview", body: "An expense tracker.", order: 1 }
  ],
  createdByUserId: "u1", createdAt: "2026-07-21T00:00:00.000Z", ...over
});

test("renders the baseline version's sections to ordered markdown", () => {
  const md = renderBaselineSpec([version()]);
  assert.equal(md, "## Overview\nAn expense tracker.\n\n## Requirements\nMust track income and expense.");
});

test("picks the isBaseline version and ignores drafts", () => {
  const draft = version({ id: "v0", isBaseline: false, status: "draft", sections: [{ id: "d", key: "d", title: "Draft", body: "old", order: 1 }] });
  const md = renderBaselineSpec([draft, version()]);
  assert.match(md, /## Overview/);
  assert.doesNotMatch(md, /Draft/);
});

test("returns null when no baseline version exists", () => {
  const draft = version({ isBaseline: false, status: "draft" });
  assert.equal(renderBaselineSpec([draft]), null);
  assert.equal(renderBaselineSpec([]), null);
});

test("clips an oversized spec and appends a truncation note", () => {
  const big = version({ sections: [{ id: "s", key: "k", title: "T", body: "x".repeat(9000), order: 1 }] });
  const md = renderBaselineSpec([big]);
  assert.ok(md.length <= 8000 + "\n… (spec truncated)".length);
  assert.match(md, /… \(spec truncated\)$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/prd-baseline-spec.test.mjs`
Expected: FAIL — cannot find module `baseline-spec.ts` / `renderBaselineSpec is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/platform-api/src/prd/baseline-spec.ts`:

```ts
import type { PrdVersion } from "../platform-services";

const SPEC_CHAR_CAP = 8000;

// Render the confirmed PRD baseline to Markdown for injection into the generation prompt. Returns
// null when the project has no confirmed baseline so the caller can simply omit the spec section.
export function renderBaselineSpec(versions: PrdVersion[]): string | null {
  const baseline = versions.find((version) => version.isBaseline);
  if (!baseline) return null;
  const markdown = [...baseline.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => `## ${section.title}\n${section.body}`)
    .join("\n\n");
  if (markdown.length <= SPEC_CHAR_CAP) return markdown;
  return `${markdown.slice(0, SPEC_CHAR_CAP)}\n… (spec truncated)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/prd-baseline-spec.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/prd/baseline-spec.ts tests/unit/prd-baseline-spec.test.mjs
git commit -m "feat: render the confirmed PRD baseline to markdown for prompt injection"
```

---

### Task 2: Render a `## Product spec` section in the build system prompt

**Files:**
- Modify: `apps/platform-api/src/generation-loop/system-prompt.ts` (add `productSpec?` param + section)
- Test: `tests/unit/system-prompt.test.mjs` (append cases) — if that file is at its ceiling, create `tests/unit/system-prompt-product-spec.test.mjs` instead.

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildSystemPrompt` accepts `productSpec?: string` and renders `## Product spec (the approved PRD — build toward it)` after `## Organizational knowledge` and before `## Current project files` when present.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/system-prompt-product-spec.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const template = { name: "Web App", lockedFiles: [] };

test("renders the product spec section when provided, before the project files", () => {
  const prompt = buildSystemPrompt({
    template,
    contextFiles: [],
    rollingSummary: null,
    productSpec: "## Overview\nAn expense tracker."
  });
  assert.match(prompt, /## Product spec \(the approved PRD — build toward it\)/);
  assert.match(prompt, /An expense tracker\./);
  assert.ok(prompt.indexOf("## Product spec") < prompt.indexOf("## Current project files"));
});

test("omits the product spec section when not provided", () => {
  const prompt = buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
  assert.doesNotMatch(prompt, /## Product spec/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/system-prompt-product-spec.test.mjs`
Expected: FAIL — the `## Product spec` heading is not present.

- [ ] **Step 3: Write minimal implementation**

In `apps/platform-api/src/generation-loop/system-prompt.ts`, add the param to the `buildSystemPrompt` input type (after `knowledgeExcerpts?`):

```ts
  knowledgeExcerpts?: string[];
  productSpec?: string;
```

Add the section builder right after the existing `knowledgeSection` block:

```ts
  const productSpecSection = input.productSpec
    ? `\n## Product spec (the approved PRD — build toward it)\n${input.productSpec}\n`
    : "";
```

Insert `${productSpecSection}` into the returned build prompt template string, between `${knowledgeSection}` and the `## Current project files` line — change:

```
${summarySection}${skillsSection}${knowledgeSection}
## Current project files (the app's LIVE current state — edit these in place, keep existing features)
```

to:

```
${summarySection}${skillsSection}${knowledgeSection}${productSpecSection}
## Current project files (the app's LIVE current state — edit these in place, keep existing features)
```

(Leave `buildPlanSystemPrompt` unchanged — spec grounding is build-mode only.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/system-prompt-product-spec.test.mjs`
Expected: PASS (2 tests). Also run `node --import tsx --test tests/unit/system-prompt.test.mjs` — still PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/system-prompt.ts tests/unit/system-prompt-product-spec.test.mjs
git commit -m "feat: render a Product spec section in the build system prompt"
```

---

### Task 3: Add `productSpec` to the governed context resolver

**Files:**
- Modify: `apps/platform-api/src/generation-loop/generation-stream-helpers.ts` (add field to `GovernedContext`)
- Modify: `apps/platform-api/src/generation-loop/governed-context.ts` (resolve the spec)
- Test: `tests/unit/governed-context-product-spec.test.mjs`

**Interfaces:**
- Consumes: `renderBaselineSpec` from `../prd/baseline-spec` (Task 1); `PrdVersion` shape via `services.prds.listVersions`.
- Produces: `GovernedContext.productSpec?: string`; `createGovernedContextResolver` accepts `Pick<PlatformApiServices, "skills" | "knowledge" | "prds">` and populates `productSpec` from the confirmed baseline, undefined on any error.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/governed-context-product-spec.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createGovernedContextResolver } from "../../apps/platform-api/src/generation-loop/governed-context.ts";

const baselineVersion = {
  id: "v1", projectId: "p1", version: "1.0.0", status: "baseline", isBaseline: true,
  sourcePrompt: "", changeSummary: "", generatedBy: { scenario: "prd_generation", providerId: "x", model: "y" },
  sections: [{ id: "s1", key: "overview", title: "Overview", body: "An expense tracker.", order: 1 }],
  createdByUserId: "u1", createdAt: "2026-07-21T00:00:00.000Z"
};

const services = (over = {}) => ({
  skills: { resolve() { throw new Error("no skill"); } },
  knowledge: { retrieve() { return { sources: [] }; } },
  prds: { listVersions: () => [baselineVersion] },
  ...over
});

const input = { actor: { id: "u1", role: "creator" }, projectId: "p1", scenario: "frontend_coding" };

test("includes the confirmed baseline spec as productSpec", async () => {
  const resolve = createGovernedContextResolver(services());
  const ctx = await resolve(input);
  assert.match(ctx.productSpec, /## Overview\nAn expense tracker\./);
});

test("leaves productSpec undefined when there is no baseline", async () => {
  const resolve = createGovernedContextResolver(services({ prds: { listVersions: () => [] } }));
  const ctx = await resolve(input);
  assert.equal(ctx.productSpec, undefined);
});

test("leaves productSpec undefined (no throw) when the PRD read fails", async () => {
  const resolve = createGovernedContextResolver(services({ prds: { listVersions() { throw new Error("no prd"); } } }));
  const ctx = await resolve(input);
  assert.equal(ctx.productSpec, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/governed-context-product-spec.test.mjs`
Expected: FAIL — `ctx.productSpec` is undefined in the first test (resolver does not read the PRD yet).

- [ ] **Step 3: Write minimal implementation**

In `apps/platform-api/src/generation-loop/generation-stream-helpers.ts`, add the field to `GovernedContext`:

```ts
export interface GovernedContext {
  availableSkills: Array<{ name: string; description: string }>;
  skillInstructions: Record<string, string>;
  knowledgeExcerpts: string[];
  productSpec?: string;
}
```

In `apps/platform-api/src/generation-loop/governed-context.ts`:

1. Add the import at the top:

```ts
import { renderBaselineSpec } from "../prd/baseline-spec";
```

2. Widen the services param to include `prds`:

```ts
export function createGovernedContextResolver(services: Pick<PlatformApiServices, "skills" | "knowledge" | "prds">) {
```

3. Before the final `return`, resolve the spec (mirror the skills/knowledge fail-soft pattern):

```ts
    let productSpec: string | undefined;
    try {
      productSpec = renderBaselineSpec(services.prds.listVersions(input.actor, input.projectId)) ?? undefined;
    } catch {
      // No PRD baseline in scope — generation proceeds without a spec.
    }

    return { availableSkills, skillInstructions, knowledgeExcerpts, productSpec };
```

(Replace the existing `return { availableSkills, skillInstructions, knowledgeExcerpts };`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/governed-context-product-spec.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/generation-stream-helpers.ts apps/platform-api/src/generation-loop/governed-context.ts tests/unit/governed-context-product-spec.test.mjs
git commit -m "feat: resolve the confirmed PRD baseline into the governed generation context"
```

---

### Task 4: Pass `productSpec` through the generation loop

**Files:**
- Modify: `apps/platform-api/src/generation-loop/generation-service.ts` (one field in `promptInput`)

**Interfaces:**
- Consumes: `GovernedContext.productSpec` (Task 3); `buildSystemPrompt`'s `productSpec?` param (Task 2).
- Produces: no new interface — wires the two together.

- [ ] **Step 1: Add the field to `promptInput`**

In `apps/platform-api/src/generation-loop/generation-service.ts`, find the `promptInput` object (it already has `availableSkills` and `knowledgeExcerpts`) and add the `productSpec` field:

```ts
          const promptInput = {
            template: deps.template,
            contextFiles,
            rollingSummary: (await deps.chatHistory.getSummary(input.projectId))?.summary ?? null,
            availableSkills: governed?.availableSkills,
            knowledgeExcerpts: governed?.knowledgeExcerpts,
            productSpec: governed?.productSpec
          };
```

- [ ] **Step 2: Confirm the file stays within its line ceiling**

Run: `wc -l apps/platform-api/src/generation-loop/generation-service.ts`
Expected: **≤ 400**. If it reports 401, shorten one adjacent comment in that method by one line (e.g. the `governed` fetch comment) — do not extract or restructure — then re-run until ≤ 400.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @evcp/platform-api typecheck`
Expected: no errors (the `governed-context` resolver call in `app-factory.ts` already passes the full `services` object, which satisfies the widened `Pick`, so no other file changes).

- [ ] **Step 4: Run the generation test suites**

Run:
```bash
EVCP_ALLOW_SIMULATE_LOGIN=1 node --import tsx --test \
  tests/unit/generation-service.test.mjs \
  tests/unit/generation-service-atomicity.test.mjs \
  tests/unit/generation-skill-injection.test.mjs \
  tests/unit/generation-build-self-heal.test.mjs
```
Expected: all PASS (the new field is optional; existing behavior is unchanged when no baseline exists).

- [ ] **Step 5: Commit**

```bash
git add apps/platform-api/src/generation-loop/generation-service.ts
git commit -m "feat: ground vibe-coding generation in the approved PRD baseline"
```

---

### Task 5: Full gate + branch verification

**Files:** none (verification only).

- [ ] **Step 1: Run the repo quality gate**

Run: `pnpm check`
Expected: repo hygiene, design-system, `oxlint --deny-warnings`, typecheck, and unit tests all PASS.

- [ ] **Step 2: Confirm line ceilings**

Run: `wc -l apps/platform-api/src/generation-loop/generation-service.ts apps/platform-api/src/platform-services.ts`
Expected: `generation-service.ts` ≤ 400; `platform-services.ts` unchanged from its committed baseline.

- [ ] **Step 3: Commit any remaining fixups** (only if the gate required a change)

```bash
git add -A
git commit -m "chore: satisfy quality gate for spec-driven vibe coding phase A"
```

---

## Self-Review

**Spec coverage:**
- "PRD read method / render baseline" → Task 1 (`renderBaselineSpec`, uses public `listVersions`, no `platform-services.ts` change — an intentional improvement over the spec's `getBaselineSpec`, which would have grown the frozen file).
- "`## Product spec` section, 8000-char cap, after knowledge / before project files, build-mode only" → Task 1 (cap) + Task 2 (section + placement + plan mode untouched).
- "`GovernedContext.productSpec`, resolver adds it, fail-soft" → Task 3.
- "generation-service passes productSpec" → Task 4.
- "Testing: system-prompt render/omit/truncate, helper render/null, resolver present/absent/throws" → Tasks 1–3 tests.
- "Acceptance: system prompt contains spec section with baseline / omitted when none / gate passes / ≤400 lines" → Tasks 4–5.

**Placeholder scan:** none — every code and test step is concrete.

**Type consistency:** `renderBaselineSpec(versions: PrdVersion[]): string | null` (Task 1) is called with `services.prds.listVersions(...)` and `?? undefined` in Task 3; `GovernedContext.productSpec?: string` (Task 3) is read as `governed?.productSpec` in Task 4 and rendered by `buildSystemPrompt`'s `productSpec?: string` (Task 2). Consistent throughout.
