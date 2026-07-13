# Task 5: Security and release readiness evidence extraction

## Scope

- Created `apps/admin-web/src/features/security-release-readiness/evidence.ts`.
- Created `apps/admin-web/src/features/security-release-readiness/index.ts`.
- Moved the security/release readiness evidence imports in `apps/admin-web/src/main.tsx` to the feature barrel and removed the in-file declarations.
- Added `tests/unit/admin-security-release-readiness-feature.test.mjs`.

The following existing evidence was extracted without content changes:

- `securityReleaseKpis`
- `tlsSessionRows`
- `secretRedactionRows`
- `uploadValidationRows`
- `releaseChecklistRows`
- `rtmRegressionRows`

UI rendering, Admin root handlers, and Admin root state remain in `main.tsx`.

## TDD evidence

1. Added the required API-ownership test before feature implementation.
2. Ran `node --import tsx --test tests/unit/admin-security-release-readiness-feature.test.mjs`.
   - Expected RED result: failed because `apps/admin-web/src/features/security-release-readiness/index.ts` did not exist.
3. Added the evidence module, public barrel exports, and `main.tsx` feature import.
4. Re-ran the same test.
   - GREEN result: 1 passing, 0 failing.

## Verification

- `node --import tsx --test tests/unit/admin-security-release-readiness-feature.test.mjs`
  - Passed: 1 test, 0 failures.
- `pnpm --filter @evcp/admin-web typecheck`
  - Passed with exit code 0.
- `node --import tsx --test tests/unit/admin-security-release-readiness-feature.test.mjs tests/unit/admin-*-feature.test.mjs`
  - Passed: 9 tests, 0 failures.
- `pnpm check:staged`
  - Passed: conflict-marker scan, design-system governance, frontend architecture, and changed-file checks.
- `git diff --cached --check`
  - Passed with no whitespace errors.
- A Node assertion compared each extracted array against `HEAD:apps/admin-web/src/main.tsx` after normalizing only `export const` to `const`.
  - Passed: all six arrays matched byte-for-byte.

## Deliberately unchanged

- Fixtures, UI behavior, Admin root handlers, and Admin root state.
- Unrelated documentation files already present in the worktree.
