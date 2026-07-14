# Phase 4 state inventory

Status date: 2026-07-14. This inventory distinguishes production authority from fixtures and
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
| Generation-loop applied SQL migrations | `WorkspaceMigrationRecord` Prisma repository | migration `20260713000001_workspace_migration_records` | Prisma |
| Workspace container lifecycle | `WorkspaceRuntimeRecord` write-through repository | migration `20260713000002_workspace_runtime_records` | Prisma |
| Long-running governed AI jobs | `AiExecutionJob` through `PrismaDurableAiJobStore`; AES-GCM payload and PostgreSQL lease | migration `20260714020000_durable_ai_execution_jobs` | Prisma |
| Project file/attachment metadata | `ProjectFileUpload` through `PrismaProjectFileRepository`; object body in MinIO | migration `20260714030000_persistent_project_file_uploads` | Prisma + MinIO |
| Generation code checkpoints | `WorkspaceCodeCheckpoint` through `PrismaWorkspaceCheckpointStore`; immutable per project/commit | migration `20260714040000_workspace_code_checkpoints` | Prisma |

## Deliberately non-authoritative state

| Location | Purpose | Pilot rule / migration action |
| --- | --- | --- |
| `Memory*PersistenceClient` implementations | deterministic unit tests and explicit `EVCP_CORE_PERSISTENCE=memory` dev mode | prohibited for pilot; retain as test doubles |
| `MemoryPlatformSessionRepository` | dev/test session lifecycle | selected only in explicit memory mode; never selected for `prisma` |
| `platform-services.ts` simulated SSO/session arrays | legacy contracts and regression tests | Keycloak production path issues persistent Platform sessions; remove after remaining legacy contract consumers are migrated |
| transient generation action coordination | one in-flight request inside a worker process | durable AI job, chat, Git commit, code checkpoint, applied SQL migration, workspace lifecycle, and project uploads are persistent; never treat an in-flight event stream as authority |
| `publish/*` in-memory deployment cache | fast healthy-container routing and deterministic publish tests | production rehydrates a healthy labelled container after restart; product manifest/registry/deployment evidence remains persisted in Prisma |
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

- Repeat the PostgreSQL route-level and browser contracts on the clean pilot host.
- Operator-owned OpenBao/KMS initialization and external encrypted backup retention.
- Clean-pilot PostgreSQL/MinIO/Keycloak restore and versioned-registry rollback evidence. Local
  encrypted PostgreSQL and MinIO restore drills passed on 2026-07-14.
