# Phase 4 state inventory

Status date: 2026-07-13. This inventory distinguishes production authority from fixtures and
explicitly documents what prevents a Prisma-only pilot. It is intentionally conservative: a
route is not marked persistent merely because it has a repository-shaped service.

## Pilot authority

| Domain | Runtime authority when `EVCP_CORE_PERSISTENCE=prisma` | Evidence | State |
| --- | --- | --- | --- |
| Platform users, roles, projects, audit | Prisma core repositories | `persistence/core-repositories.ts` | Prisma |
| Platform access/refresh sessions | `PlatformAuthSession` through `PrismaPlatformSessionRepository` | migration `20260713000000_platform_auth_refresh_rotation` | Prisma |
| AI governance | AI governance Prisma repository | `persistence/ai-governance-repositories.ts` | Prisma |
| Business settings | business settings Prisma repository | `persistence/business-settings-repositories.ts` | Prisma |
| PRD | PRD Prisma repository | `persistence/prd-repositories.ts` | Prisma |
| Workspace metadata | workspace Prisma repository | `persistence/workspace-repositories.ts` | Prisma |
| Publishing and Store records | publish/store Prisma repository | `persistence/publish-store-repositories.ts` | Prisma |
| Generated runtime records | generated-runtime Prisma repository | `persistence/generated-runtime-repositories.ts` | Prisma |

## Deliberately non-authoritative state

| Location | Purpose | Pilot rule / migration action |
| --- | --- | --- |
| `Memory*PersistenceClient` implementations | deterministic unit tests and explicit `EVCP_CORE_PERSISTENCE=memory` dev mode | prohibited for pilot; retain as test doubles |
| `MemoryPlatformSessionRepository` | dev/test session lifecycle | selected only in explicit memory mode; never selected for `prisma` |
| `platform-services.ts` simulated SSO/session arrays | legacy contracts and regression tests | Keycloak production path issues persistent Platform sessions; remove after remaining legacy contract consumers are migrated |
| `generation-loop/*` in-memory stores | transient build/chat orchestration and local development | migrate durable chat/checkpoint/run state before live generation becomes pilot authority |
| `publish/*` in-memory adapters | deterministic publish tests | production factory must use registry/runtime adapters and persisted deployment records |
| frontend `fallback*`, fixtures, initial bootstrap objects | offline UI fixtures | pilot configuration must show loading/empty/error instead of treating fixture mutation as success; Store is fail-closed as of this change |

## Migration controls

1. Pilot starts only with `EVCP_CORE_PERSISTENCE=prisma` and `DATABASE_URL` pointing at the
   managed PostgreSQL instance.
2. Apply migrations with `pnpm --filter @evcp/platform-api prisma migrate deploy`; never use
   `db push` for pilot data.
3. Take a PostgreSQL backup before each migration. Roll back application code first; do not
   reverse a destructive data migration until its dedicated rollback script and restore drill
   exist.
4. Session refresh rotation is conditional and transaction-scoped. A competing refresh is treated
   as token reuse and revokes its session family.
5. Restart proof must cover a newly created user, Keycloak session refresh, revoke, and a
   persisted project/PRD/Store mutation. The command and timestamps belong in release evidence.

## Remaining Phase 4 blockers

- Real PostgreSQL route-level integration suite (not only repository/unit contracts).
- Durable generation chat/checkpoint/run ledger and production secret-store/KMS integration.
- Remove or gate Creator's remaining fixture fallbacks and validate every Admin operational panel
  against API data.
- Backup/restore drill for PostgreSQL, MinIO and Keycloak export.
