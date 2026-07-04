# Sprint 9 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-04
Status: Accepted

## 1. Acceptance Principle

Sprint 9 is accepted only if auth and policy hardening work as one integrated production blueprint foundation: Admin can manage SSO provider contracts, Platform Auth owns normalized sessions and generated app validation, break-glass is controlled and audited, policy templates are visible, and the full regression suite remains green.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| OIDC provider config masks secret and audits creation | Unit and E2E/API output | Passed |
| SAML provider config fingerprints certificate and audits creation | Unit and E2E/API output | Passed |
| Keycloak default broker contract is exposed | Unit and E2E/API output | Passed |
| Direct IdP constraints preserve Platform Auth boundary | Unit, E2E/API and ADR evidence | Passed |
| SSO simulation normalizes claims and app roles | Unit and E2E/API output | Passed |
| Generated app session validation denies invalid tokens and missing app roles | Unit and E2E/API output | Passed |
| Break-glass requires reason, uses 15-minute TTL and emits critical audit | Unit and E2E/API output | Passed |
| Policy templates cover all classifications | Unit, integration and E2E/API output | Passed |
| Prisma migration and seed include Sprint 9 records | Integration test and DB query output | Passed |
| Admin Auth/SSO UI renders production readiness sections | E2E/UI and screenshot evidence | Passed |
| Sprint 0-8 regression tests remain green | `pnpm verify:sprint9` | Passed |

## 3. Product Owner Checklist

- [x] OIDC config does not expose raw `clientSecret`.
- [x] SAML config does not expose raw certificate.
- [x] Keycloak default realm, clients and groups are documented and exposed.
- [x] Direct IdP mode requires security review and cannot bypass Platform Auth.
- [x] Platform Auth claims include subject, email, groups, platform roles and app roles.
- [x] Generated app validation returns explicit deny reason for invalid/missing session.
- [x] Break-glass login rejects missing reason.
- [x] Break-glass session TTL is 15 minutes.
- [x] Critical audit event `auth.break_glass_used` is recorded.
- [x] Policy templates are present for Public, Internal, Confidential and Restricted.
- [x] Admin UI includes SSO Providers, Role / Group Mapping, Break-glass Admin, Policy Templates and Auth Session Evidence.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified.
- [x] Screenshot and console evidence are captured.

## 4. Verification Evidence

Commands to execute before acceptance:

```bash
pnpm verify:sprint9
pnpm --filter @evcp/platform-api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:admin
```

Expected UI screenshot evidence:

- `docs/assets/screenshots/sprint9-auth-policy.png`
- `docs/assets/screenshots/sprint9-auth-policy-mobile.png`

Results:

| Evidence | Result |
| --- | --- |
| `pnpm verify:sprint9` | Passed: lint, typecheck, build, unit 46/46, integration 31/31, e2e 31/31 |
| Prisma validate | Passed |
| Prisma generate | Passed |
| Prisma migrate deploy | Passed: applied `20260703000008_sprint9_auth_policy_hardening` |
| Prisma seed | Passed |
| DB count query | `auth_provider_configs=3`, `platform_auth_sessions=1`, `break_glass_sessions=1`, `policy_templates=4` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint9-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint9-auth-policy.png`, `docs/assets/screenshots/sprint9-auth-policy-mobile.png` |

## 5. Rejection Rules

Reject Sprint 9 if:

- OIDC/SAML provider responses expose secret or certificate material.
- Provider creation does not produce auditable evidence.
- Generated apps can bypass Platform Auth or validate directly against enterprise IdP.
- Break-glass can be used without reason or with a long-lived session.
- Break-glass does not emit a critical audit event.
- Direct IdP support is documented as bypassing Keycloak but not Platform Auth.
- Policy templates do not cover all four data classifications.
- Prisma schema, migration or seed records are missing.
- Admin UI omits any required production-readiness section.
- Regression from a previous accepted sprint breaks without documented exception.

## 6. Product Owner Decision

Accepted. Sprint 9 is approved for the next sprint because auth and policy hardening now work across API, schema, seed data and Admin UI: OIDC/SAML provider config protects sensitive material, Platform Auth owns generated app session validation, break-glass is short-lived and critically audited, policy templates are explicit, and the full Sprint 0-9 regression suite passes.
