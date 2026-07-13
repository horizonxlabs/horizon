# Code Quality Gates

This project uses layered quality gates so routine work stays fast while CI still
protects the full product surface.

## Local Commands

- `pnpm check` runs repository hygiene, conflict-marker scan, workspace script
  validation, Oxlint, TypeScript typecheck, and unit tests.
- `pnpm check:ci` adds the install contract, production build, integration tests,
  and E2E tests. CI uses this gate.
- `pnpm check:changed --base origin/main` checks only changed files for merge
  markers, Oxlint warnings, and workspace package-script drift.
- `pnpm check:staged` is the pre-commit gate and checks only staged files.
- `pnpm check:design-system` scans app source for design-system governance:
  no app-local stylesheets, no inline visual styles, no hardcoded colors, and no
  local CSS imports outside `@evcp/ui/styles.css`.
- `pnpm check:frontend-architecture` enforces the React feature-first dependency boundaries.
  `pnpm check`, `pnpm check:changed`, `pnpm check:staged`, and CI run it too.
- `pnpm format` formats the full repository with Prettier.
- `pnpm format:check:all` audits the full formatting baseline. Formatting is
  intentionally opt-in while the existing repository formatting baseline is being
  normalized.

## Pull Request Expectations

Every non-trivial PR should include the commands or CI run used as evidence.
User-facing or operational changes should update the relevant docs in the same
PR. Security-sensitive areas are routed through CODEOWNERS.

## Frontend structure migration

New app business code belongs in `features/<feature-name>` and exposes intentional exports from
`index.ts`. Use `@/features/<name>` for cross-feature imports, never a deep feature path; `shared`
must not import `app`, `routes`, or `features`. The checked-in legacy baseline allows existing
`components`, `hooks`, `lib`, `pages`, and `data` files while blocking new legacy siblings.

When the architecture gate fails, move new business files under `features/<feature-name>`, expose a
public API through `index.ts`, replace deep cross-feature imports, or migrate a baseline file before
creating a legacy sibling. Do not edit the baseline merely to bypass the migration rule.

## Quality Layers

- **Syntax and hygiene:** conflict markers, large-file/private-key checks through
  pre-commit, and YAML/workflow linting in CI.
- **Static analysis:** Oxlint runs with `--deny-warnings`, so new warning-level
  issues fail the gate.
- **Type safety:** every workspace package must expose `typecheck`; the root gate
  runs all workspace typechecks.
- **Design-system governance:** app surfaces compose `@evcp/ui` and keep tokens,
  shared classes, and visual styling in `packages/ui/styles.css`.
- **Tests:** unit tests run locally by default; CI adds integration and E2E tests.
- **Dependency upkeep:** Dependabot tracks npm and GitHub Actions updates.
