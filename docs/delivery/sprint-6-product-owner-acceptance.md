# Sprint 6 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-03
Status: Accepted

## 1. Acceptance Principle

Sprint 6 is accepted only if Creator can manage app access and publish a ready generated app into a registry record that Sprint 7 can consume. Publish must be backed by manifest, checklist, deployment and audit evidence.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Creator sees app members, invites, access requests and roles | UI source/screenshot and E2E smoke | Passed |
| Internal invite creates pending invitation | Unit and E2E/API output | Passed |
| External invite shows approval-required warning | Unit and UI evidence | Passed |
| Access request approval updates membership | Unit and E2E/API output | Passed |
| App manifest references PRD/frontend/auth/roles/database | Unit and API output | Passed |
| Publish blocks missing requirements | Unit and E2E/API denial | Passed |
| Publish creates deployment record and registry entry | Unit and E2E/API output | Passed |
| End User cannot manage creator-side publish/access endpoints | E2E/API denial | Passed |
| Prisma migration and seed include Sprint 6 records | Integration test and DB query output | Passed |
| Sprint 0-5 regression tests remain green | `pnpm verify:sprint6` | Passed |

## 3. Product Owner Checklist

- [x] Creator can view app members, pending invites, access requests and roles.
- [x] Creator can invite internal End User and assign an app role.
- [x] External invite returns approval-required policy warning.
- [x] Creator can approve access request and create membership.
- [x] Publish Review shows manifest and readiness checklist.
- [x] Blocked publish explains missing requirements.
- [x] Successful publish creates deployment record and App Store registry entry.
- [x] Registry state includes slug, route, visibility and roles for Sprint 7.

## 4. Verification Evidence

Commands to execute before acceptance:

```bash
pnpm verify:sprint6
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:creator
```

Expected UI screenshot evidence: `docs/assets/screenshots/sprint6-users-publish.png`.

Results:

| Evidence | Result |
| --- | --- |
| `pnpm verify:sprint6` | Passed: unit 29/29, integration 22/22, e2e 20/20 |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000005_sprint6_users_publish` |
| Prisma seed | Passed |
| DB count query | `app_invitations=2`, `app_access_requests=1`, `app_manifests=1`, `publish_requests=1`, `deployment_records=1`, `app_store_registry_entries=1` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint6-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint6-users-publish.png` |

## 5. Rejection Rules

Reject Sprint 6 if:

- Publish succeeds without PRD baseline or active frontend checkpoint.
- External invite is treated as active access without approval-required policy state.
- End users can call Creator app management or publish endpoints.
- App manifest omits PRD, frontend checkpoint, auth, roles or database metadata.
- Deployment record or registry entry is missing after publish.
- Sprint 0, Sprint 1, Sprint 2, Sprint 3, Sprint 4 or Sprint 5 regression tests fail.

## 6. Product Owner Decision

Accepted. Sprint 6 is approved for the next sprint because app access state is visible and auditable, publish is gated by manifest readiness, incomplete apps are blocked, successful publish creates deployment and registry records, and Sprint 7 can consume the published registry/access contract.
