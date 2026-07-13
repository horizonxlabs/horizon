# Task 4 — Admin root composition migration

## Completed

- Moved the Admin root composition from `main.tsx` to `app/AdminApp.tsx` without changing its state, handlers, API calls, or dashboard markup.
- Added `routes/AdminRoutes.tsx` for the existing setup and session guard selection; it consumes only the public `auth-sso` and `installer-operations` feature barrels.
- Moved the generic Admin platform/session client to `shared/platform-client.ts` and updated its existing consumers.
- Preserved #141 feature barrel exports and extended the two relevant barrels with their existing screen exports.
- Reduced `main.tsx` to style loading and `createRoot(<AdminApp />)`.
- Added `tests/unit/admin-web-render-smoke.test.mjs`, including ownership assertions and static render probes for the root and both guards.

## Verification

```text
node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs  PASS (2 tests)
pnpm --filter @evcp/admin-web typecheck                         PASS
pnpm --filter @evcp/admin-web build                             PASS
pnpm check:frontend-architecture                                PASS
git diff --check                                                PASS
```

The smoke probe launches its Admin imports with the Admin TypeScript configuration because the repository-level test configuration maps the shared `@/` alias to Creator sources.
