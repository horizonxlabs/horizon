# Sprint 9 Delivery Note

Date: 2026-07-04
Branch: `codex/sprint-9-auth-policy-hardening`
Issue: #11
Scope: OIDC/SAML provider config, Keycloak default broker contract, direct IdP constraints, Platform Auth session validation, break-glass admin and policy templates.

## Delivered Scope

- Added `PlatformAuthSsoService` for OIDC/SAML provider configuration, Keycloak defaults, direct IdP constraints, normalized SSO sessions and generated app session validation.
- Added `BreakGlassService` with reason-required, 15-minute local fallback sessions and critical audit event emission.
- Added `PolicyTemplateService` with Public/Internal/Confidential/Restricted defaults for reviewers, checks, publish allowance and external exposure.
- Added Platform API routes for Admin auth provider configuration, Keycloak defaults, direct IdP constraints, simulated login, generated app validation, break-glass and policy template evaluation.
- Added Prisma schema, migration and seed data for auth provider configs, platform auth sessions, break-glass sessions and policy templates.
- Added Admin Auth / SSO Production Readiness UI using shared design-system components and tokens.
- Added Sprint 9 unit, integration and E2E/API/UI smoke tests while preserving previous sprint regression checks.
- Updated ADR-005, sprint planning, UI spec, test plan, traceability and product-owner acceptance docs.

## Verification

Primary gate:

```bash
pnpm verify:sprint9
```

Result: Passed on 2026-07-04.

| Gate | Evidence |
| --- | --- |
| Sprint lint | `Sprint lint checks passed` |
| Typecheck | 10 workspace projects passed |
| Build | Platform API plus Admin Web, Creator Web and App Store PWA passed |
| Unit tests | 46 passed, 0 failed |
| Integration tests | 31 passed, 0 failed |
| E2E/API/UI smoke tests | 31 passed, 0 failed |
| Console check | Playwright warning capture reported 0 errors and 0 warnings |

Additional database verification:

```bash
pnpm --filter @evcp/platform-api prisma:generate
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Result: Passed on 2026-07-04.

| Table | Count |
| --- | ---: |
| `auth_provider_configs` | 3 |
| `platform_auth_sessions` | 1 |
| `break_glass_sessions` | 1 |
| `policy_templates` | 4 |

UI evidence:

- `docs/assets/screenshots/sprint9-auth-policy.png`
- `docs/assets/screenshots/sprint9-auth-policy-mobile.png`
- `docs/assets/screenshots/sprint9-console-warnings.txt`

## Product Owner Decision

Accepted. Sprint 9 meets the production blueprint auth/policy hardening acceptance gate: OIDC/SAML contracts mask sensitive material, Platform Auth owns generated app session validation, break-glass is reason-bound and audited, policy templates are visible, database migration/seed are verified, and the full Sprint 0-9 regression suite remains green.
