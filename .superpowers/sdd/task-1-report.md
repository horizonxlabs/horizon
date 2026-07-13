# Task 1 — Runtime hardening evidence extraction

## Status

Completed. Runtime hardening evidence is now owned by the `runtime-hardening` feature and consumed through its public barrel API.

## Files changed

- `apps/admin-web/src/features/runtime-hardening/evidence.ts` — extracted runtime KPI, contract, endpoint, log, and metric evidence.
- `apps/admin-web/src/features/runtime-hardening/index.ts` — exports the feature public API.
- `apps/admin-web/src/main.tsx` — imports evidence from the feature; removes local constants.
- `tests/unit/admin-runtime-hardening-feature.test.mjs` — verifies barrel exports and that `main.tsx` no longer declares `runtimeKpis`.

## TDD evidence

1. Added the focused test before production code.
2. RED: `node --import tsx --test tests/unit/admin-runtime-hardening-feature.test.mjs` failed as expected with `ENOENT` for the missing feature barrel (`0 pass, 1 fail`).
3. GREEN: implemented the evidence module and public barrel, then removed the local declarations from `main.tsx`.
4. GREEN verification: the same focused test passed (`1 pass, 0 fail`).

## Verification

- `node --import tsx --test tests/unit/admin-runtime-hardening-feature.test.mjs` — passed (1/1).
- `pnpm --filter @evcp/admin-web typecheck` — passed (`tsc -p tsconfig.json --noEmit`).
- `git diff --check` — passed.
- New Task 1 files pass Prettier checking. A Prettier check that includes `apps/admin-web/src/main.tsx` reports that pre-existing broad file formatting differs; it was not mass-reformatted because that is outside this focused extraction task.

## Scope and concerns

- Only Task 1 feature, test, and report files were changed; the pre-existing untracked plan documents were preserved.
- No behavioral values were altered; ownership and imports only were moved.
