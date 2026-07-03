# ADR-001: Single Enterprise Private Server Deployment

**Status:** Proposed  
**Date:** 2026-07-03  
**Deciders:** Product Owner, Software Architect, IT/System Admin, Security Admin

## Context

Enterprise Vibe Coding Platform is intended to run as a private AI application builder for one organization at a time. The production blueprint baseline chooses a Single Enterprise / Private Server deployment, Online Private Server networking, Docker Compose for production v1, and a migration-ready path to Kubernetes later.

The platform must be easy to install and operate on a private server while still supporting enterprise controls: SSO, AI provider governance, generated app containers, schema isolation, backup, restore, audit, license enforcement, and monitoring.

Related requirements: `FR-INST-001` to `FR-INST-006`, `FR-BCK-001` to `FR-BCK-003`, `FR-OBS-001`, `OPS-001` to `OPS-010`.

## Decision

Production v1 will use a **single-enterprise, single-private-server deployment model** with a bundled Docker Compose stack. The installer will deploy platform services and required infrastructure services into one organization-owned environment.

The architecture must avoid business logic that depends on Docker Compose-specific names or local filesystem assumptions so the platform can migrate to Kubernetes in a later phase.

## Options Considered

### Option A: Single Enterprise / Private Server with Docker Compose

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Low to medium |
| Scalability | Fits pilot and early production private server targets |
| Team familiarity | High |

**Pros:** Simple install path, strong organization isolation, matches private server requirement, simpler backup/restore, easier enterprise procurement.

**Cons:** Limited horizontal scaling, single-server failure domain, must design carefully for future Kubernetes migration.

### Option B: Multi-tenant SaaS

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Cost | High |
| Scalability | High |
| Team familiarity | Medium |

**Pros:** Centralized operations, easier fleet updates, SaaS business model ready.

**Cons:** Conflicts with private server baseline, much higher data isolation/compliance burden, larger security surface.

### Option C: Kubernetes-first Private Deployment

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Cost | Medium to high |
| Scalability | High |
| Team familiarity | Medium |

**Pros:** Better orchestration and scaling, standard enterprise platform for larger organizations.

**Cons:** Increases install complexity, overfits v1 needs, contradicts easy-to-install principle for private server v1.

## Trade-off Analysis

Docker Compose is less powerful than Kubernetes, but it is the right first production target because the platform baseline prioritizes installability and maintainability for a single enterprise private server. The main risk is future migration pain, so service discovery, configuration, storage, health checks, and generated app deployment contracts must be abstracted away from Compose-specific implementation details.

## Consequences

- Installer and Local Web Setup Wizard can be built around a deterministic private server stack.
- Backup/restore and upgrade/rollback can be scoped to one environment.
- HA/hot standby is not a v1 default and must be documented as a future architecture phase.
- Generated apps must still be isolated at container and schema boundaries even within one Compose deployment.
- Kubernetes migration requires a future ADR before implementation.

## Action Items

1. [ ] Define the minimum supported private server hardware profile.
2. [ ] Define Docker Compose service boundaries and health checks.
3. [ ] Define configuration abstraction so service names and paths are not hardcoded in business logic.
4. [ ] Define backup/restore coverage for PostgreSQL, MinIO/S3, Keycloak config, generated artifacts, PRDs, and audit logs.
5. [ ] Add Kubernetes migration assumptions to the future architecture backlog.
