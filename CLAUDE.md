# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Horizon (`@evcp/*` packages) — a private, single-enterprise AI application builder ("vibe coding platform"). Enterprise users describe an app via PRD generation, the platform runs an AI generation loop against a containerized workspace, and the resulting app can be published to an internal App Store PWA. Designed to run as a self-hosted Docker Compose stack on one organization's private server (see `docs/architecture/ADR-001-single-enterprise-private-server-deployment.md`), with Kubernetes migration kept open — avoid hardcoding Compose-specific service names or local-filesystem assumptions into business logic.

Development proceeds in numbered "sprints", each adding a vertical slice (schema + service + routes + UI + tests). `README.md` documents sprint scope; `docs/architecture/ADR-*.md` record the underlying design decisions.

## Commands

Package manager is pnpm (workspace via `pnpm-workspace.yaml`: `apps/*`, `packages/*`). Node >=22.

```bash
pnpm install
pnpm dev            # admin-web + creator-web + app-store-pwa in parallel
pnpm dev:admin      # single frontend app
pnpm dev:creator
pnpm dev:store
pnpm dev:api        # Platform API (NestJS, tsx watch)
```

Quality gate (mirrors CI):

```bash
pnpm check          # repo hygiene, conflict markers, workspace scripts, design-system check, oxlint, typecheck, unit tests
pnpm check:ci        # check + install contract, build, integration tests, e2e tests
pnpm check:changed --base origin/main   # only changed files (used in CI diff checks)
pnpm check:staged    # only staged files (pre-commit hook)
```

Individual pieces:

```bash
pnpm lint            # lint:repo + lint:code (oxlint --deny-warnings)
pnpm typecheck        # tsc --noEmit across every workspace package
pnpm build            # build all packages/apps
pnpm format           # prettier --write repo-wide
pnpm check:design-system   # forbids app-local stylesheets/inline styles/hardcoded colors outside packages/ui
```

Tests use Node's built-in test runner via `tsx`, not a separate framework:

```bash
pnpm test               # unit -> integration -> e2e, in order
pnpm test:unit
pnpm test:integration
pnpm test:e2e

# single test file
node --import tsx --test tests/unit/<file>.test.mjs
node --import tsx --test tests/integration/<file>.test.mjs
node --import tsx --test tests/e2e/<file>.test.mjs
```

Sprint-scoped full verification (lint + typecheck + build + test): `pnpm verify:sprint0` through `pnpm verify:sprint14`.

Local install / Docker stack:

```bash
cp .env.example .env                      # then replace every example secret
pnpm install:preflight                    # validate .env + compose contract
pnpm install:plan                         # dry-run the install flow
pnpm install:real                         # execute private-server install
pnpm verify:install                       # install contract tests, no real secrets
pnpm verify:installer
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

Database (Prisma, in `apps/platform-api`):

```bash
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

`prisma migrate reset --force` drops and re-migrates but does **not** run the seed — `platform_roles`/`platform_users` come back empty, which breaks admin-setup flows that `connect` an existing role instead of creating one. Re-run `pnpm --filter @evcp/platform-api seed` after any reset.

## Architecture

### Workspace layout

- `apps/admin-web`, `apps/creator-web`, `apps/app-store-pwa` — Vite + React frontends (admin console, creator/builder UI, end-user PWA storefront).
- `apps/platform-api` — NestJS backend (`src/platform-api.module.ts`, `src/app-factory.ts`, `src/main.ts`), Prisma schema/migrations/seed in `apps/platform-api/prisma/`.
- `packages/ui` — the *only* place styling lives; `packages/ui/styles.css` is the shared design system. Apps compose `@evcp/ui` classes/tokens and must not add local stylesheets, inline visual styles, or hardcoded colors (enforced by `pnpm check:design-system`).
- `packages/api-client`, `packages/auth-sdk`, `packages/config`, `packages/mock-data`, `packages/types` — shared client/runtime code consumed by all three frontends and the API.
- `tests/unit`, `tests/integration`, `tests/e2e` — flat `*.test.mjs` files (not colocated with source), run via `node --import tsx --test`.
- `docs/architecture/ADR-*.md` — design decisions per feature area (auth broker, generated-app container/schema isolation, publish governance, PRD lifecycle, etc.). Check the relevant ADR before changing that area.
- `docs/operations/real-mvp-*.md` — current state of the mock-to-real migration (persistence modes, auth sessions, AI provider adapter, install flow) — read these before assuming a subsystem is fully "real" vs. mock-backed.

### Platform API internals (`apps/platform-api/src`)

- `platform-services.ts` / `app-factory.ts` are large composition-root files wiring services together; treat them as backlog for decomposition (see Frontend/file-size conventions below) rather than a place to keep growing.
- `persistence/*-repositories.ts` — Prisma-shaped repository layer per domain (core, workspace, PRD, AI governance, publish store, generated runtime, business settings).
- Runtime persistence mode is controlled by `EVCP_CORE_PERSISTENCE`: `legacy` (mock-first), `memory` (deterministic in-memory, used for tests), `prisma` (real Postgres via `DATABASE_URL`).
- `generation-loop/` — the AI "vibe coding" loop: LLM client, system prompt, message parsing, find/replace edits, migration runner, checkpoints, chat history/route.
- `workspace-orchestrator/` — per-project containerized dev workspace lifecycle: Docker engine adapters (`docker-engine.ts`, `docker-socket-engine.ts`), Postgres provisioning per workspace, MinIO object storage, secret store, idle sweep/state, tar injection, HTTP routes.
- `publish/` — turns a workspace into a deployed generated app (pre-publish checks, deployment store, health checks, git port, HTTP routes).
- `auth/` — platform credential service, password hashing, Prisma-backed credential store; supports both native platform auth and external SSO/OIDC/SAML brokered through Keycloak (see ADR-005).

### Frontend conventions (`apps/creator-web` is the reference layout — see `docs/ARCHITECTURE.md`)

```
apps/<app>/src/
  main.tsx        # entry only: routes to a page + createRoot, stays tiny
  lib/             # pure, framework-agnostic logic — unit-tested directly
  hooks/           # stateful glue (useState/useEffect), composed from smaller hooks
  components/      # one reusable presentational component per file
  pages/           # one presentational component per screen; renders `app.*` from the hook, no business logic
```

- Logic belongs in `lib/` (pure) or `hooks/` (stateful) — never inline in a page. If it can't be unit-tested without rendering, it's misplaced.
- Files are capped at **400 lines**, enforced by `scripts/quality/check-changed.mjs` as a ratchet: new files over 400 lines are blocked outright; pre-existing large files are grandfathered in `scripts/quality/large-file-baseline.json` and may only shrink, never grow. After intentionally shrinking a baselined file, run `node scripts/quality/update-large-file-baseline.mjs` to lock in the new ceiling.
- `admin-web/src/main.tsx` and `platform-api/src/platform-services.ts` / `app-factory.ts` are known-oversized legacy files on that baseline — when touching one, split off a focused module (boy-scout rule) rather than adding to it.
- `tests/unit/creator-web-render-smoke.test.mjs` renders the real app hook and every page via `renderToStaticMarkup` (browser globals stubbed, no effects) to catch render-time throws that `tsc`/`vite build` miss. When splitting a component/hook, extend the render-smoke coverage for it; to add coverage for another app, copy this harness pattern.

### Deployment stack

`docker/docker-compose.yml` defines the full private-server stack: `postgres`, `redis`, `minio`, `keycloak`, `platform-api`, `admin-web`, `creator-web`, `app-store-pwa`, `caddy` (reverse proxy/TLS), `litellm` (AI provider gateway). Postgres credentials in local/dev are `evcp`/`evcp` against database `evcp` (not `postgres`); Prisma models use camelCase-quoted columns (e.g. `"passwordHash"`) over snake_case-plural tables (e.g. `platform_users`, `platform_roles`).
