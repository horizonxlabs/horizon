# Frontend Feature-First Architecture Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Establish a feature-first frontend architecture for all React apps and enforce its dependency, import, and legacy-folder rules in local checks and CI.

**Architecture:** Existing workspace packages remain the cross-application shared layer: @evcp/ui, @evcp/api-client, @evcp/auth-sdk, @evcp/types, and @evcp/config. Within each apps/*/src, new business code lives in features/<capability>; app composition lives in app; generic app-local primitives live in shared; and route entry points live in routes. A Node quality checker reads source imports and a checked-in legacy-file baseline, preventing new code from extending legacy layer-first folders while permitting incremental migration.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node 22 ESM scripts, pnpm, Oxlint, Node built-in test runner via tsx.

## Global Constraints

- Preserve current workspace packages; do not duplicate shared API, UI, or types inside an app source tree.
- New business capability code is under apps/<app>/src/features/<feature-name>/; do not create empty future folders.
- Dependency direction is app → routes → features → shared. Shared never imports feature, route, or app. Cross-feature imports use only features/<feature>/index.ts.
- New target-layout code uses @/app/, @/features/, or @/shared/ aliases. Existing relative imports are allowed only for baseline legacy files.
- Keep root tests in tests/unit, tests/integration, and tests/e2e; colocated feature tests require a separate runner migration.
- Keep existing design-system, 400-line, and ratchet rules. The checker runs from check, check:ci, check:changed, and pre-commit.

---

## File Structure

- Create: docs/architecture/ADR-012-frontend-feature-first-governance.md — ownership, dependency direction, public API, and migration decision.
- Modify: docs/ARCHITECTURE.md and docs/testing/code-quality.md — developer rules and remediation.
- Create: scripts/quality/frontend-legacy-path-baseline.json — sorted existing legacy source files.
- Create: scripts/quality/check-frontend-architecture.mjs — source/import boundary checker.
- Create: tests/unit/frontend-architecture-governance.test.mjs — checker and wiring tests.
- Modify: package.json, scripts/quality/check.mjs, scripts/quality/check-changed.mjs, scripts/quality/check-workspace-scripts.mjs — invoke the gate.
- Modify: apps/admin-web/tsconfig.json, apps/creator-web/tsconfig.json, apps/app-store-pwa/tsconfig.json and their vite.config.ts — per-app @ alias.

## Task 1: Publish the target structure and capture the migration baseline

**Files:**
- Create: docs/architecture/ADR-012-frontend-feature-first-governance.md
- Modify: docs/ARCHITECTURE.md
- Create: scripts/quality/frontend-legacy-path-baseline.json
- Test: tests/unit/frontend-architecture-governance.test.mjs

**Interfaces:**
- Produces allowed roots: app, features, shared, routes, assets, mocks, test, and main.tsx.
- Produces a lexically sorted JSON string array of repository-relative legacy files.

- [ ] **Step 1: Write the failing test**

~~~js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("frontend ADR defines the dependency direction", () => {
  const adr = readFileSync("docs/architecture/ADR-012-frontend-feature-first-governance.md", "utf8");
  assert.match(adr, /app → routes → features → shared/);
  assert.match(adr, /Shared modules must never import feature, route, or app modules/);
  assert.match(adr, /index\.ts is the only cross-feature public API/);
});

test("legacy baseline is sorted and is app source only", () => {
  const files = JSON.parse(readFileSync("scripts/quality/frontend-legacy-path-baseline.json", "utf8"));
  assert.deepEqual(files, [...files].sort());
  assert.equal(files.every((file) => /^apps\/[^/]+\/src\//.test(file)), true);
});
~~~

- [ ] **Step 2: Run RED**

Run: node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs

Expected: FAIL because ADR-012 and the baseline do not exist.

- [ ] **Step 3: Implement the contract**

ADR decision text must include:

~~~md
Each React application uses app, features, shared, and routes as its target source layout. app composes providers, layouts, configuration, and the root application. features/<name> owns one business capability and exposes only intentional public API through index.ts. shared contains application-local generic code only; workspace packages remain the shared cross-application layer.

Dependency direction is app → routes → features → shared. Shared modules must never import feature, route, or app modules. A feature consumes another feature only through that feature's index.ts; deep cross-feature imports are prohibited.
~~~

Generate the JSON baseline from every existing .ts and .tsx file below apps/admin-web/src, apps/creator-web/src, and apps/app-store-pwa/src that is outside target roots. Do not add empty features or move code in this task.

- [ ] **Step 4: Run GREEN**

Run: node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add docs/architecture/ADR-012-frontend-feature-first-governance.md docs/ARCHITECTURE.md scripts/quality/frontend-legacy-path-baseline.json tests/unit/frontend-architecture-governance.test.mjs
git commit -m "docs(frontend): define feature-first architecture"
~~~

## Task 2: Implement an executable boundary checker

**Files:**
- Create: scripts/quality/check-frontend-architecture.mjs
- Modify: tests/unit/frontend-architecture-governance.test.mjs

**Interfaces:**
- Produces CLI: node scripts/quality/check-frontend-architecture.mjs [--files].
- With --files, read NUL-separated changed paths from stdin; without it, inspect all application source.
- Print every violation as [frontend-architecture] <file>: <reason>; exit 1 when violations exist.

- [ ] **Step 1: Write failing fixture cases**

Create temp fixture source files and assert the checker rejects:

~~~js
const cases = [
  ["shared imports feature", "apps/demo/src/shared/table.ts", "import { User } from '@/features/users';"],
  ["deep feature import", "apps/demo/src/features/a/api/client.ts", "import { UserTable } from '@/features/users/components/UserTable';"],
  ["new legacy root file", "apps/demo/src/components/NewCard.tsx", "export const NewCard = () => null;"],
  ["new relative import", "apps/demo/src/features/users/pages/UsersPage.tsx", "import { Button } from '../../../shared/Button';"]
];
~~~

Assert a route importing @/features/users and a feature importing @/shared/format-date passes.

- [ ] **Step 2: Run RED**

Run: node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement exact rules**

~~~ts
const TARGET_ROOTS = new Set(["app", "features", "shared", "routes", "assets", "mocks", "test"]);
const LEGACY_ROOTS = new Set(["components", "hooks", "lib", "pages", "data"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
~~~

For each inspected app source file:

1. Permit main.tsx and files below TARGET_ROOTS.
2. Permit a file below LEGACY_ROOTS only if it exists in frontend-legacy-path-baseline.json. Otherwise report: new code must use app, features, shared, or routes instead of legacy root <root>.
3. Parse static import and export specifiers with source-text regex; do not add an AST dependency.
4. In shared, reject alias/relative targets in app, features, or routes.
5. In features/<a>, reject @/features/<b>/<deep-path> when a and b differ. Permit @/features/<b> and @/features/<b>/index.
6. In routes, reject deep feature imports; permit only public feature barrels.
7. In any non-baseline target-layout source file, reject relative imports resolving inside src; report: new target-layout code must use @/ aliases.
8. Ignore package imports, Node imports, CSS, URLs, and unresolved external imports.

- [ ] **Step 4: Run GREEN**

Run: node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs && node scripts/quality/check-frontend-architecture.mjs

Expected: all tests PASS and checker prints [frontend-architecture] checks passed.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/quality/check-frontend-architecture.mjs tests/unit/frontend-architecture-governance.test.mjs
git commit -m "feat(quality): enforce frontend architecture boundaries"
~~~

## Task 3: Wire aliases and quality gates

**Files:**
- Modify: apps/admin-web/tsconfig.json, apps/creator-web/tsconfig.json, apps/app-store-pwa/tsconfig.json
- Modify: apps/admin-web/vite.config.ts, apps/creator-web/vite.config.ts, apps/app-store-pwa/vite.config.ts
- Modify: package.json, scripts/quality/check.mjs, scripts/quality/check-changed.mjs, scripts/quality/check-workspace-scripts.mjs
- Test: tests/unit/frontend-architecture-governance.test.mjs

**Interfaces:**
- Produces pnpm check:frontend-architecture.
- In every app, @/x resolves to src/x consistently in TypeScript and Vite.
- Full, changed-file, and staged quality gates run the checker.

- [ ] **Step 1: Add failing wiring assertions**

~~~js
test("quality commands and Vite configs expose the architecture gate and aliases", () => {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(rootPackage.scripts["check:frontend-architecture"], "node scripts/quality/check-frontend-architecture.mjs");
  for (const file of ["apps/admin-web/vite.config.ts", "apps/creator-web/vite.config.ts", "apps/app-store-pwa/vite.config.ts"]) {
    assert.match(readFileSync(file, "utf8"), /resolve\(__dirname, "src"\)/);
  }
  assert.match(readFileSync("scripts/quality/check.mjs", "utf8"), /check:frontend-architecture/);
  assert.match(readFileSync("scripts/quality/check-changed.mjs", "utf8"), /check-frontend-architecture\.mjs/);
});
~~~

- [ ] **Step 2: Run RED**

Run: node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs

Expected: FAIL because aliases and command do not exist.

- [ ] **Step 3: Implement configuration**

In every app tsconfig.json, add:

~~~json
"compilerOptions": {
  "baseUrl": ".",
  "paths": { "@/*": ["src/*"] }
}
~~~

In every Vite config, import resolve from node:path and add:

~~~ts
resolve: { alias: { "@": resolve(__dirname, "src") } }
~~~

Add script "check:frontend-architecture": "node scripts/quality/check-frontend-architecture.mjs". Call it after design-system governance in check.mjs. In check-changed.mjs invoke it with changedFiles encoded as NUL-separated stdin. Add the script to REQUIRED_ROOT_SCRIPTS.

- [ ] **Step 4: Run GREEN**

Run: pnpm check:frontend-architecture && pnpm check:changed --base HEAD~1 && pnpm typecheck

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

~~~bash
git add apps/*/tsconfig.json apps/*/vite.config.ts package.json scripts/quality/check.mjs scripts/quality/check-changed.mjs scripts/quality/check-workspace-scripts.mjs tests/unit/frontend-architecture-governance.test.mjs
git commit -m "build(frontend): wire feature-first quality gate"
~~~

## Task 4: Document workflow and prove enforcement

**Files:**
- Modify: docs/testing/code-quality.md and docs/ARCHITECTURE.md
- Modify: tests/unit/frontend-architecture-governance.test.mjs

- [ ] **Step 1: Write failing documentation assertions**

~~~js
test("developer docs describe the required feature-first workflow", () => {
  const architecture = readFileSync("docs/ARCHITECTURE.md", "utf8");
  const quality = readFileSync("docs/testing/code-quality.md", "utf8");
  assert.match(architecture, /features\/<feature-name>/);
  assert.match(architecture, /Feature public API/);
  assert.match(quality, /pnpm check:frontend-architecture/);
  assert.match(quality, /legacy baseline/);
});
~~~

- [ ] **Step 2: Run RED**

Run: node --import tsx --test tests/unit/frontend-architecture-governance.test.mjs

Expected: FAIL because developer docs lack the required workflow.

- [ ] **Step 3: Add exact developer guidance**

Add this folder map to docs/ARCHITECTURE.md:

~~~text
apps/<app>/src/
  app/        composition, providers, layouts, configuration
  routes/     URL mapping, guards, loaders; no feature business logic
  features/   business capabilities; only index.ts is cross-feature API
  shared/     generic app-local code; never imports feature/route/app
~~~

Document no empty scaffolding; capability-owned API/components/types; external feature imports through @/features/<name>; UI permission helpers do not replace backend authorization; and target-layout code uses @ aliases.

In docs/testing/code-quality.md document the command, baseline migration rule, changed-file/CI coverage, and remediation: move new business files under features/<name>, expose intentional exports through index.ts, replace deep cross-feature imports, or migrate a baseline file before creating legacy siblings.

- [ ] **Step 4: Run final verification**

Run: pnpm check:frontend-architecture && pnpm check && pnpm check:ci

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

~~~bash
git add docs/ARCHITECTURE.md docs/testing/code-quality.md tests/unit/frontend-architecture-governance.test.mjs
git commit -m "docs(frontend): publish enforced feature-first workflow"
~~~

## Self-Review

### Spec coverage

The plan enforces feature-first ownership, public barrels, shared-layer direction, app composition and routes, alias imports, incremental migration, developer documentation, pre-commit, changed-file checks, and CI. It intentionally retains root test placement because the current runner and repository convention require it.

### Placeholder scan

The plan contains exact files, enforcement rules, commands, expected outcomes, and commit messages.

### Type consistency

The checker command is consistently named check:frontend-architecture; the baseline is frontend-legacy-path-baseline.json; target roots and aliases match the ADR, checker, scripts, and documentation.
