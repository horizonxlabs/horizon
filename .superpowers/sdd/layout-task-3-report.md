# Task 3 — App Store PWA layout migration

## Completed

- Reduced `main.tsx` to style loading and `StoreApp` mounting.
- Added `app/StoreApp.tsx` and `routes/StoreRoutes.tsx`; the existing leave-management URL predicate is unchanged.
- Moved the storefront composition into the storefront feature and the generated leave-management screen into its own public feature.
- Added public feature barrels for storefront, access requests, installations, support tickets, and generated leave management.
- Moved generic API-base URL, session-token, and client construction into `shared/platform-client.ts`.
- Kept local fallback response construction feature-owned and preserved all endpoint calls, request values, fallback values, and URL behavior.
- Added the requested root/route ownership smoke test.

## Verification

- `node --import tsx --test tests/unit/app-store-pwa-render-smoke.test.mjs` — pass
- `pnpm --filter @evcp/app-store-pwa typecheck` — pass
- `pnpm --filter @evcp/app-store-pwa build` — pass
- `pnpm check:frontend-architecture` — pass
- `git diff --check` — pass

The build retains the pre-existing unresolved-at-build-time font URL notices from the UI stylesheet; it exits successfully.
