# Task 2 — Creator root composition and capability ownership

## Scope

Migrated Creator Web's root composition, current conditional page mapping, and legacy Creator
business modules into `app`, `routes`, capability-owned `features`, and generic `shared`.
No dependencies, routes, API calls, session behavior, fixture values, or fallback behavior changed.

## Ownership

- `app/CreatorApp.tsx` owns the existing login/change-password/workspace authentication gate.
- `routes/CreatorRoutes.tsx` maps every existing `CreatorPage` value to its public feature screen.
- Each route-visible capability has an `index.ts` feature API: authentication, projects, workspace,
  PRD, publish, users, tickets, and default dashboard.
- Generic Creator session/client/routing/types/fixture helpers are under `shared`.
- `main.tsx` now performs style loading and renders `CreatorApp` only.
- Removed the corresponding Creator legacy-baseline entries as their legacy files were moved.

## TDD evidence

### RED

Updated `tests/unit/creator-web-render-smoke.test.mjs` before creating the composition modules to
assert that `main.tsx` imports `@/app/CreatorApp`, routes import the projects public API, and the
legacy auth gate is absent from `main.tsx`.

`node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs` failed because
`apps/creator-web/src/routes/CreatorRoutes.tsx` did not yet exist.

### GREEN

After the move-and-compose extraction:

```text
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs  # 9/9 pass
pnpm check:frontend-architecture                                      # pass
pnpm --filter @evcp/creator-web typecheck                             # pass
pnpm --filter @evcp/creator-web build                                 # pass
pnpm check:staged                                                     # pass
```

The build retains the pre-existing runtime font-resolution warnings for `/creator/fonts/*`; it
completes successfully.

The staged large-file gate permits the unchanged 405-line workspace hook at its relocated,
ratcheted baseline path; it did not grow.

## Guardrails observed

- No router, global store, data-fetching dependency, or API/session contract was introduced.
- Public feature barrels are used for route and cross-feature screen/component consumption.
- Existing smoke renders the real `useCreatorApp` hook and all seven Creator screens.
