# ADR-004: Policy-Based Publish Governance

**Status:** Proposed  
**Date:** 2026-07-03  
**Deciders:** Product Owner, Software Architect, App Owner, IT/System Admin, Security Admin, Data Owner

## Context

The platform must let creators move quickly while preventing risky changes from bypassing enterprise governance. Publish requests can vary widely: low-risk frontend-only changes, Confidential/Restricted data, public/external access, custom domains, backend code changes, auth/security changes, and destructive database migrations.

Related requirements: `FR-RUN-006`, `FR-DATA-001` to `FR-DATA-003`, `FR-PRD-003`, `FR-PRD-004`, policy decision table, approval lifecycle, audit requirements.

## Decision

The platform will use **policy-based publish governance**. Every publish request is evaluated by a policy engine using data classification, access mode, domain exposure, code change type, schema migration type, security impact, knowledge/skill dependency changes, and license state.

The policy engine returns required reviewers and blocking checks. Review decisions are immutable audit records.

## Options Considered

### Option A: Creator Self-Publish

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Cost | Low |
| Scalability | High for speed, low for governance |
| Team familiarity | High |

**Pros:** Fastest workflow, least operational overhead.

**Cons:** Too risky for enterprise production, weak data/security governance.

### Option B: IT Admin Approves Every Publish

| Dimension | Assessment |
| --- | --- |
| Complexity | Low to medium |
| Cost | Medium |
| Scalability | Low |
| Team familiarity | High |

**Pros:** Strong central control, easy to understand.

**Cons:** Recreates IT bottleneck, conflicts with goal to reduce backlog, over-approves low-risk changes.

### Option C: Policy-Based Approval

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Medium |
| Scalability | High |
| Team familiarity | Medium |

**Pros:** Balances speed and governance, routes only risky changes to specialized reviewers, supports auditability.

**Cons:** Requires clear policy rules, reviewer role mapping, and strong testing.

## Trade-off Analysis

Policy-based approval is more complex than fixed approval, but it matches the enterprise requirement: low-risk internal changes should not block on IT, while public, external, Restricted, destructive, auth, and domain changes must be reviewed by the right roles.

## Consequences

- Publish requests need structured metadata about code, data, domain, migration, and access changes.
- Policy decisions must be stored as snapshots so historical approvals remain explainable.
- Reviewers must be resolved from roles and scopes, not hardcoded users.
- Rejection and changes-requested loops must preserve traceability to PRD, code, and deployment artifacts.
- Policy templates for data classification become a blocking product/security artifact.

## Action Items

1. [ ] Define policy input schema for publish requests.
2. [ ] Define default policy templates for Public, Internal, Confidential, and Restricted apps.
3. [ ] Define approval request and reviewer resolution data model.
4. [ ] Define immutable approval audit event schema.
5. [ ] Define build/deploy checks that run only after policy approval.
