# Sprint 10 UI Spec - Generated App Runtime Hardening

Version: 0.1
Date: 2026-07-04
Status: Implemented and Accepted
Related plan: `docs/planning/sprint-10-plan.md`

## 1. Design Objective

Sprint 10 Admin UI must help IT/System Admin and Security Admin answer whether a published generated app is production-runnable:

- Does the app have a generated artifact contract?
- Which container/image/route is serving it?
- Is database access isolated to the app schema?
- Are health, readiness, logs and metrics available?
- Is the generated API documented by OpenAPI?
- Are migrations dry-runnable and approval-gated?

## 2. Design Direction

| Dimension | Decision |
| --- | --- |
| Tone | Professional runtime control plane |
| Density | Data-dense and scannable; no marketing hero |
| Components | Reuse `@evcp/ui`: `MetricCard`, `WorkflowRail`, `SectionCard`, `DataTable`, `DefinitionGrid`, `DecisionPanel`, `ToneBadge` |
| Icons | Use `lucide-react` icons for runtime, database, route and security signals |
| Layout | KPI strip, left runtime path rail, two-column evidence grid; mobile collapses to one column |
| Accessibility | Semantic section label, table headers, visible text statuses and non-color-only decisions |

## 3. Screen Inventory

| Surface | Screen / Section | Purpose |
| --- | --- | --- |
| Admin Console | Generated App Runtime Hardening | Top-level runtime evidence panel |
| Admin Console | Container Contract | Artifact root, container name, image tag and route |
| Admin Console | Schema Isolation | Assigned schema, DB user, allowed and denied schemas |
| Admin Console | Health / Readiness | Runtime probe endpoints and signals |
| Admin Console | Structured Logs | Request-level app/deployment log sample |
| Admin Console | Metrics | Request/error/latency signals |
| Admin Console | OpenAPI Contract | Spec path, version, paths and linked deployment |
| Admin Console | Migration Dry Run | Approval gate for destructive migration changes |

## 4. Layout Wireframe

```text
+----------------------------------------------------------------------------+
| Generated App Runtime Hardening                         [production contract]|
| Runtime evidence for published generated apps                                |
+----------------+----------------+----------------+--------------------------+
| running        | isolated       | 5/5 readiness  | dry-run passed           |
+----------------+----------------+----------------+--------------------------+
| Runtime Path   | Container Contract                                           |
| manifest       | Area | Contract | Evidence                                  |
| container      +--------------------------------------------------------------+
| schema grant   | Schema Isolation        | Health / Readiness                |
| health/openapi | DB user, allowed/denied | /health /ready /metrics           |
+--------------- +--------------------------------------------------------------+
| Structured Logs             | Metrics                                      |
+-----------------------------+----------------------------------------------+
| OpenAPI Contract            | Migration Dry Run                             |
+----------------------------------------------------------------------------+
```

## 5. Component Usage

| Component | Usage |
| --- | --- |
| `MetricCard` | Four runtime KPIs: status, schema grant, readiness, migration dry-run |
| `WorkflowRail` | Runtime path from manifest to health/OpenAPI |
| `SectionCard` | Each runtime evidence group |
| `DataTable` | Container contract, endpoints, logs and metrics |
| `DefinitionGrid` | Schema and OpenAPI metadata |
| `DecisionPanel` | Schema enforcement and migration approval warnings |
| `ToneBadge` | Runtime status, readiness and approval states |

## 6. States

| State | UI Requirement |
| --- | --- |
| Runtime running | Show container status, image tag, route and probe endpoints |
| Runtime degraded | Show degraded status and failing probe owner |
| Assigned schema access | Show allowed schema and DB user evidence |
| Cross-schema attempt | Show denied schema and audit-ready explanation |
| Migration non-destructive | Show dry-run passed |
| Migration destructive without approval | Show blocked and required approvers |
| OpenAPI missing | Show missing contract as a blocking readiness gate |

## 7. API Data Contract

| API | UI Use |
| --- | --- |
| `GET /admin/runtime/projects/:projectId` | Render runtime overview |
| `POST /admin/runtime/projects/:projectId/schema/check` | Show schema allow/deny evidence |
| `GET /admin/runtime/projects/:projectId/health` | Render health, readiness, metrics and log sample |
| `GET /admin/runtime/projects/:projectId/openapi` | Render OpenAPI version/path list |
| `POST /admin/runtime/projects/:projectId/migrations/dry-run` | Render passed/blocked migration report |

## 8. Acceptance Criteria

- [x] Admin UI includes Generated App Runtime Hardening top-level section.
- [x] Container Contract section shows artifact/container/image/route evidence.
- [x] Schema Isolation section shows schema, DB user, allowed and denied schemas.
- [x] Health / Readiness section shows health, ready and metrics endpoints.
- [x] Structured Logs and Metrics sections expose request and operational signals.
- [x] OpenAPI Contract section links spec path, version and deployment.
- [x] Migration Dry Run section communicates destructive-change approval gate.
- [x] Desktop and mobile screenshot evidence are captured.
- [x] Console capture has 0 errors and 0 warnings.
