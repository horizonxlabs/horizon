# ADR-005: Auth Broker and External IdP Strategy

**Status:** Proposed  
**Date:** 2026-07-03  
**Deciders:** Product Owner, Software Architect, IT/System Admin, Security Admin

## Context

Production v1 must support OIDC, SAML, bundled Keycloak, external IdP/direct integration, and a local break-glass admin account. The requirements baseline intentionally allows both bundled Keycloak and external IdP/direct integration, but architecture must choose a default strategy for implementation.

Related requirements: `FR-AUTH-001` to `FR-AUTH-006`, `SEC-006`, `SEC-007`, `TC-AUTH-001` to `TC-AUTH-006`, RTM gap "Direct IdP vs broker routing detail".

## Decision

The default production v1 authentication strategy will use **Platform Auth as the application boundary** with Keycloak as the default bundled identity broker. External OIDC/SAML providers can be connected through Keycloak by default. Direct external IdP integration may be supported through the same Platform Auth abstraction when required, but generated apps must only integrate with Platform Auth.

Local break-glass admin remains a platform-controlled fallback path and must not depend on external IdP availability.

## Options Considered

### Option A: Bundled Keycloak Required for All SSO

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Low to medium |
| Scalability | Medium |
| Team familiarity | Medium |

**Pros:** One broker model, strong support for OIDC/SAML federation, simpler generated app integration.

**Cons:** Some enterprises may prefer direct integration with existing IdP; Keycloak becomes a required operational component.

### Option B: Direct IdP Integration Only

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium to high |
| Cost | Medium |
| Scalability | Medium |
| Team familiarity | Medium |

**Pros:** Fewer bundled components, aligns with organizations that already have mature IdP.

**Cons:** More provider differences leak into platform, SAML/OIDC handling becomes platform responsibility, harder local test setup.

### Option C: Platform Auth Boundary with Keycloak Default and Direct Integration Optional

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Medium |
| Scalability | High |
| Team familiarity | Medium |

**Pros:** Generated apps depend only on Platform Auth, Keycloak gives a complete default, direct integration remains possible without changing app contracts.

**Cons:** Requires a clean abstraction and careful session/claims mapping.

## Trade-off Analysis

The most important boundary is not whether Keycloak or a direct IdP handles federation. The important boundary is that the platform and generated apps consume a stable Platform Auth contract. Keycloak should be the default because it satisfies OIDC/SAML and local private deployment needs, while direct integration remains an advanced option.

## Consequences

- Generated apps must never integrate directly with enterprise IdP.
- Platform Auth owns session, claims, role mapping, and app permission context.
- Keycloak realm configuration becomes part of backup/restore and upgrade compatibility checks.
- Direct IdP support must pass the same auth/session/claims tests as Keycloak-backed auth.
- Break-glass admin must be audited and protected separately from SSO flows.

## Action Items

1. [ ] Define Platform Auth session and claims contract.
2. [ ] Define Keycloak realm/client/group mapping defaults.
3. [ ] Define direct external IdP integration constraints and when it is allowed.
4. [ ] Define generated app Platform Auth SDK contract.
5. [ ] Define break-glass admin policy, session limits, and audit event schema.
