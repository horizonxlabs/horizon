# Sprint 9 UI Spec - Auth SSO and Policy Hardening

Version: 0.1
Date: 2026-07-04
Status: Implemented and Accepted
Related plan: `docs/planning/sprint-9-plan.md`

## 1. Design Objective

Sprint 9 Admin UI must feel like an enterprise control plane for auth and data policy. The screen should let IT/System Admin and Security Admin quickly answer:

- Which SSO providers are configured?
- What is the default Keycloak broker contract?
- How are IdP groups mapped to platform/project/app roles?
- Can generated apps validate Platform Auth sessions without direct IdP integration?
- Is break-glass controlled, time-limited and audit-ready?
- Which data classification templates drive approval and exposure policy?

## 2. Design Direction

| Dimension | Decision |
| --- | --- |
| Tone | Professional, quiet, production-readiness dashboard |
| Density | Data-dense but scannable, no marketing hero treatment |
| Components | Reuse `@evcp/ui`: `SectionCard`, `DataTable`, `DefinitionGrid`, `DecisionPanel`, `ToneBadge` |
| Icons | Use `lucide-react` icons for security and session indicators |
| Layout | KPI strip followed by two-column operational grid; mobile collapses to one column |
| Accessibility | Every state uses visible text, table headers, semantic sections and no color-only status |

## 3. Screen Inventory

| Surface | Screen / Section | Purpose |
| --- | --- | --- |
| Admin Console | Auth / SSO Production Readiness | Top-level production extension readiness panel |
| Admin Console | SSO Providers | Provider registry with Keycloak, OIDC and SAML status |
| Admin Console | Auth Session Evidence | Normalized Platform Auth claims and generated app boundary |
| Admin Console | Role / Group Mapping | Source groups mapped to platform/project/app roles |
| Admin Console | Break-glass Admin | Local fallback policy, TTL, reason and critical audit event |
| Admin Console | Policy Templates | Public/Internal/Confidential/Restricted governance defaults |

## 4. Layout Wireframe

```text
+----------------------------------------------------------------------------+
| Auth / SSO Production Readiness                              [extension]    |
| Platform Auth boundary and policy hardening                                  |
+----------------+----------------+----------------+--------------------------+
| OIDC ready     | SAML ready     | Keycloak active| Direct IdP review        |
+----------------+----------------+----------------+--------------------------+
| SSO Providers                    | Auth Session Evidence                    |
| Provider | Type | Status | Map     | Session metadata + Platform Auth gate |
+----------------------------------+------------------------------------------+
| Role / Group Mapping             | Break-glass Admin                        |
| Source -> Platform -> Project    | Reason required / TTL / critical audit   |
+----------------------------------+------------------------------------------+
| Policy Templates                                                            |
| Classification | Reviewers | Required Checks | External Exposure             |
+----------------------------------------------------------------------------+
```

## 5. Component Usage

| Component | Usage |
| --- | --- |
| `SectionCard` | Frame each operational control group |
| `DataTable` | Provider list, role mapping and policy template matrix |
| `DefinitionGrid` | Session, token hash, break-glass and policy metadata |
| `DecisionPanel` | Platform Auth boundary and break-glass critical warning |
| `ToneBadge` | Provider status, platform role and audit severity |
| `MetricCard` or shell KPI block | Four top readiness states |

## 6. States

| State | UI Requirement |
| --- | --- |
| Provider secret saved | Show masked value/fingerprint only; never show raw secret |
| SAML certificate saved | Show fingerprint only |
| Direct IdP selected | Show security review required and Platform Auth boundary copy |
| Missing generated app session | Show deny state with `invalid_session` reason |
| Missing app role | Show deny state with `missing_app_role` reason |
| Break-glass active | Show 15-minute TTL, reason and critical audit event |
| Restricted policy selected | Show publish/external exposure blocked and required reviewers |

## 7. API Data Contract

| API | UI Use |
| --- | --- |
| `GET /admin/auth/providers` | Render provider registry |
| `POST /admin/auth/providers/oidc` | Create OIDC provider and show masked response |
| `POST /admin/auth/providers/saml` | Create SAML provider and show certificate fingerprint |
| `GET /admin/auth/keycloak-defaults` | Show default realm/client/group mapping |
| `GET /admin/auth/direct-idp-constraints` | Show direct IdP governance warning |
| `POST /admin/auth/simulate-login` | Show normalized Platform Auth claims |
| `POST /admin/auth/generated-app/validate-session` | Show generated app allow/deny decision |
| `POST /admin/auth/break-glass` | Show fallback session and audit-ready evidence |
| `GET /admin/policy-templates` | Render classification policy matrix |
| `POST /admin/policy-templates/evaluate` | Render selected policy result |

## 8. Acceptance Criteria

- [x] Admin can see OIDC, SAML, Keycloak and direct IdP readiness at a glance.
- [x] Provider registry never reveals raw client secrets or SAML certificate values.
- [x] Auth Session Evidence explains that generated apps use Platform Auth, not enterprise IdP directly.
- [x] Role mapping table shows source groups to platform/project/app role mapping.
- [x] Break-glass panel communicates reason requirement, 15-minute TTL and critical audit.
- [x] Policy matrix shows reviewers, checks and external exposure defaults for all classifications.
- [x] Layout remains readable at mobile width with no overlap or clipped labels.
- [x] Screenshot evidence is captured in `docs/assets/screenshots/sprint9-auth-policy.png` and `docs/assets/screenshots/sprint9-auth-policy-mobile.png`.
