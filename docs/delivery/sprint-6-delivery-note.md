# Sprint 6 Delivery Note

Date: 2026-07-03
Branch: `codex/sprint-6-users-publish`
Issue: #5
Scope: App user management, app roles, invites/access requests, app manifest, publish readiness, deployment record and App Store registry.

## Delivered Scope

- Added app access service for roles, members, invitations and access requests.
- Added internal invite and external approval-required invite policy state.
- Added access request approve/reject flow that updates app membership and audit trail.
- Added publish service with manifest generation from PRD baseline, frontend checkpoint, auth, roles and database metadata.
- Added publish readiness checklist and blocked publish error path.
- Added deployment record and App Store registry entry on successful publish.
- Added Platform API routes for app users, roles, invitations, access requests, publish review, publish and registry.
- Added Prisma schema, migration and seed data for Sprint 6 app access and publish records.
- Extended Creator UI with App Users, Pending Invites, Access Requests, App Roles, Publish Review, Deployment Record and App Store registry state.
- Added Sprint 6 unit, integration and E2E/API/UI smoke coverage while preserving Sprint 0-5 regression checks.

## Verification

Primary gate:

```bash
pnpm verify:sprint6
```

Result: Passed on 2026-07-03.

| Gate | Evidence |
| --- | --- |
| Sprint lint | `Sprint lint checks passed` |
| Typecheck | 10 workspace projects passed |
| Build | Platform API plus Admin Web, Creator Web and App Store PWA passed |
| Unit tests | 29 passed, 0 failed |
| Integration tests | 22 passed, 0 failed |
| E2E/API/UI smoke tests | 20 passed, 0 failed |
| Console check | Playwright warning capture reported 0 errors and 0 warnings |

Additional database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Result: Passed on 2026-07-03.

| Table | Count |
| --- | ---: |
| `app_invitations` | 2 |
| `app_access_requests` | 1 |
| `app_manifests` | 1 |
| `publish_requests` | 1 |
| `deployment_records` | 1 |
| `app_store_registry_entries` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint6-users-publish.png`
- `docs/assets/screenshots/sprint6-console-warnings.txt`

## Product Owner Decision

Accepted. Sprint 6 meets the app access and publish acceptance gate: Creator can view and manage app users/roles/invites/access requests, external invites show approval-required policy state, publish review generates a manifest/checklist, incomplete apps are blocked, successful publish creates deployment and registry records, and unauthorized end users are denied creator-side management.
