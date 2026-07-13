# ADR-012: Frontend feature-first governance

## Status

Accepted — 2026-07-13

## Decision

Each React application uses `app`, `features`, `shared`, and `routes` as its target source layout. `app` composes providers, layouts, configuration, and the root application. `features/<name>` owns one business capability and exposes only intentional public API through `index.ts`. `shared` contains application-local generic code only; workspace packages remain the shared cross-application layer.

Dependency direction is **app → routes → features → shared**. Shared modules must never import feature, route, or app modules. A feature consumes another feature only through that feature’s `index.ts`; deep cross-feature imports are prohibited. `index.ts is the only cross-feature public API`.

The workspace packages `@evcp/ui`, `@evcp/api-client`, `@evcp/auth-sdk`, `@evcp/types`, and `@evcp/config` remain the cross-application shared layer. Applications must not create local replacements for them.

## Rules

- Put new business capability code in `features/<feature-name>/`; do not create empty feature scaffolds.
- Feature-owned API clients, UI, hooks, schemas, types, and utilities stay with their capability.
- Route files map URLs, guards, and loaders; they do not own feature business logic.
- New target-layout code imports source modules using `@/app`, `@/features`, or `@/shared` aliases.
- UI permission checks improve UX but never replace backend authorization.
- Root test placement remains `tests/unit`, `tests/integration`, and `tests/e2e` until the runner convention changes.

## Migration

The existing layer-first files are recorded in `scripts/quality/frontend-legacy-path-baseline.json`. They may be migrated incrementally, but no new files may extend those legacy roots. The executable architecture check enforces this rule locally, for changed files, in pre-commit, and in CI.
