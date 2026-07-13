# Admin Remaining Feature Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the remaining Admin Console capability-owned evidence from the entry module into feature-first public modules, while preserving UI behaviour.

**Architecture:** Each feature owns its static dashboard evidence in an `evidence.ts` module and exposes it through `index.ts`. `main.tsx` remains the composition root: it imports feature barrels and retains state, API calls, and UI event handlers that are not yet capability-isolated.

**Tech Stack:** React, TypeScript, Vite, Node test runner with `tsx`, pnpm.

## Global Constraints

- Do not change fixture values or Admin Console behaviour.
- A feature is imported only through its `index.ts` public API.
- Retain `main.tsx` as the temporary composition root permitted by ADR-012.
- Preserve the unrelated untracked AI-governance plan.

---

### Task 1: Extract runtime hardening evidence

**Files:**
- Create: `apps/admin-web/src/features/runtime-hardening/evidence.ts`
- Create: `apps/admin-web/src/features/runtime-hardening/index.ts`
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-runtime-hardening-feature.test.mjs`

- [x] **Step 1: Write the failing test**

```js
assert.match(featureApi, /runtimeKpis/);
assert.match(featureApi, /runtimeContractRows/);
assert.doesNotMatch(main, /const runtimeKpis/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-runtime-hardening-feature.test.mjs`

- [x] **Step 3: Implement the feature public API**

```ts
export { runtimeContractRows, runtimeEndpointRows, runtimeKpis, runtimeLogRows, runtimeMetricRows } from "./evidence";
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-runtime-hardening-feature.test.mjs`

### Task 2: Extract knowledge and skills evidence

**Files:**
- Create: `apps/admin-web/src/features/knowledge-skills/evidence.ts`
- Create: `apps/admin-web/src/features/knowledge-skills/index.ts`
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-knowledge-skills-feature.test.mjs`

- [x] **Step 1: Write the failing test**

```js
assert.match(featureApi, /knowledgeSourceRows/);
assert.match(featureApi, /skillAssignmentRows/);
assert.doesNotMatch(main, /const knowledgeSkillKpis/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-knowledge-skills-feature.test.mjs`

- [x] **Step 3: Implement the feature public API**

```ts
export { knowledgeSkillKpis, knowledgeSourceRows, skillAssignmentRows, skillLibraryRows } from "./evidence";
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-knowledge-skills-feature.test.mjs`

### Task 3: Extract installer operations evidence

**Files:**
- Create: `apps/admin-web/src/features/installer-operations/evidence.ts`
- Create: `apps/admin-web/src/features/installer-operations/index.ts`
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-installer-operations-feature.test.mjs`

- [x] **Step 1: Write the failing test**

```js
assert.match(featureApi, /installWizardSteps/);
assert.match(featureApi, /restoreValidationRows/);
assert.doesNotMatch(main, /const operationsRecoveryKpis/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-installer-operations-feature.test.mjs`

- [x] **Step 3: Implement the feature public API**

```ts
export { backupRunRows, composeReadinessRows, installWizardSteps, operationsRecoveryKpis, restoreValidationRows } from "./evidence";
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-installer-operations-feature.test.mjs`

### Task 4: Extract observability and licensing evidence

**Files:**
- Create: `apps/admin-web/src/features/observability-licensing/evidence.ts`
- Create: `apps/admin-web/src/features/observability-licensing/index.ts`
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-observability-licensing-feature.test.mjs`

- [x] **Step 1: Write the failing test**

```js
assert.match(featureApi, /telemetryExportRows/);
assert.match(featureApi, /licenseEnforcementRows/);
assert.doesNotMatch(main, /const observabilityLicenseKpis/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-observability-licensing-feature.test.mjs`

- [x] **Step 3: Implement the feature public API**

```ts
export { generatedAppHealthRows, licenseEnforcementRows, observabilityLicenseKpis, productionServiceRows, queueBackpressureRows, telemetryExportRows, upgradeCompatibilityRows } from "./evidence";
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-observability-licensing-feature.test.mjs`

### Task 5: Extract security and release readiness evidence

**Files:**
- Create: `apps/admin-web/src/features/security-release-readiness/evidence.ts`
- Create: `apps/admin-web/src/features/security-release-readiness/index.ts`
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-security-release-readiness-feature.test.mjs`

- [x] **Step 1: Write the failing test**

```js
assert.match(featureApi, /securityReleaseKpis/);
assert.match(featureApi, /rtmRegressionRows/);
assert.doesNotMatch(main, /const securityReleaseKpis/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-security-release-readiness-feature.test.mjs`

- [x] **Step 3: Implement the feature public API**

```ts
export { releaseChecklistRows, rtmRegressionRows, secretRedactionRows, securityReleaseKpis, tlsSessionRows, uploadValidationRows } from "./evidence";
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-security-release-readiness-feature.test.mjs`

### Task 6: Verify and update the single PR

**Files:**
- Modify: `apps/admin-web/src/main.tsx`
- Test: `tests/unit/admin-*-feature.test.mjs`

- [x] **Step 1: Run focused feature tests**

Run: `node --import tsx --test tests/unit/admin-*-feature.test.mjs`

- [x] **Step 2: Run repository and production checks**

Run: `pnpm check && pnpm --filter @evcp/admin-web build && git diff --check`

- [x] **Step 3: Commit and push the completed migration to PR #141**

```bash
git add apps/admin-web/src/features apps/admin-web/src/main.tsx tests/unit docs/superpowers/plans/2026-07-13-admin-remaining-feature-migration.md
git commit -m "refactor(admin): migrate remaining feature evidence"
git push
```
