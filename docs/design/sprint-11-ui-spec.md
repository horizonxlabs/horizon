# Sprint 11 UI Spec - Knowledge and Skill Governance

Version: 0.1
Date: 2026-07-04
Status: Implemented and screenshot verified
Related plan: `docs/planning/sprint-11-plan.md`

## 1. Design Objective

Sprint 11 Admin UI must help IT/System Admin and AI Admin answer:

- Which knowledge sources and skill versions are active, pending, disabled or superseded?
- Which approved immutable versions can AI workflows resolve for this project/app/scenario?
- Why was a knowledge or skill version approved, denied or excluded?
- What metadata will Creator workspace prompts carry for audit and reproducibility?

## 2. Design Direction

| Dimension | Decision |
| --- | --- |
| Tone | Enterprise governance control plane |
| Density | Data-dense and scannable; no marketing hero |
| Components | Reuse `@evcp/ui`: `MetricCard`, `WorkflowRail`, `SectionCard`, `DataTable`, `DefinitionGrid`, `DecisionPanel`, `ToneBadge`, `ServiceStrip` |
| Icons | Use `lucide-react` database, route, shield, alert and AI icons |
| Layout | KPI strip, left governance path rail, two-column evidence grid; mobile collapses to one column |
| Accessibility | Semantic section label, table headers, text statuses, explicit allow/deny reason and audit IDs |

## 3. Screen Inventory

| Surface | Screen / Section | Purpose |
| --- | --- | --- |
| Admin Console | Knowledge and Skill Governance | Top-level governance dashboard |
| Admin Console | Knowledge Source Library | Source metadata, owner, scope, index and active version |
| Admin Console | Knowledge Version Approval | Immutable hash, changelog, approval and audit evidence |
| Admin Console | Scoped Retrieval | Actor/project/app/department/role/scenario filtering evidence |
| Admin Console | Skill Library / Skill Versioning | Skill lifecycle and version contract |
| Admin Console | Skill Assignment | Role/scenario/scope assignment matrix |
| Admin Console | Workspace Context | Evidence carried into Creator AI task metadata |

## 4. Layout Wireframe

```text
+--------------------------------------------------------------------------------+
| Knowledge and Skill Governance                              [Simulate] [Add]    |
| Govern approved knowledge retrieval and active skill selection                   |
+----------------+----------------+----------------+-----------------------------+
| active sources | pending review | retrieval pass | active skills              |
+----------------+----------------+----------------+-----------------------------+
| Governance Path | Knowledge Source Library                                      |
| upload source   | Source | Type | Owner | Scope | Index | Active               |
| index version   +---------------------------------------------------------------+
| approve active  | Version Approval        | Scoped Retrieval                   |
| scoped retrieve | hash, changelog, audit  | filters + ALLOW/DENY reason        |
| select skill    +---------------------------------------------------------------+
| audit metadata  | Skill Library           | Skill Assignment                   |
+-----------------+--------------------------------------------------------------+
| Workspace Context: selected skillVersionId + knowledgeVersionIds + audit event  |
+--------------------------------------------------------------------------------+
```

## 5. Component Usage

| Component | Usage |
| --- | --- |
| `MetricCard` | Active knowledge, pending approvals, retrieval pass count, active skills |
| `WorkflowRail` | Source upload to workspace metadata path |
| `SectionCard` | Each evidence group |
| `DataTable` | Sources, skills and assignment matrix |
| `DefinitionGrid` | Version hash, schema/tool contract and task metadata |
| `DecisionPanel` | Approved, denied and metadata decisions |
| `ToneBadge` | approved, indexed, active, denied, disabled and pending states |
| `ServiceStrip` | Indexer, approval policy, retrieval logs and audit export readiness |

## 6. States

| State | UI Requirement |
| --- | --- |
| Approved active | Show as selectable/resolved with success badge |
| Pending version | Visible as evidence but not selectable |
| Superseded version | Visible in history but excluded from retrieval/resolution |
| Disabled skill | Visible but not selectable by workspace workflows |
| Retrieval denied | Show exact exclusion reason and retrieval log ID |
| Empty library | Preserve dashboard structure and show Add Source / Add Skill actions |
| Mobile | Dense tables become governance mobile cards with labels and status text |

## 7. API Data Contract

| API | UI Use |
| --- | --- |
| `GET /admin/knowledge/sources` | Render source library |
| `POST /admin/knowledge/sources` | Add source metadata |
| `POST /admin/knowledge/sources/:sourceId/versions` | Submit immutable source version |
| `POST /admin/knowledge/versions/:versionId/approve` | Activate approved knowledge version |
| `POST /admin/knowledge/retrieve` | Simulate scoped retrieval |
| `GET /admin/knowledge/retrieval-logs` | Render retrieval/audit evidence |
| `GET /admin/skills` | Render skill library |
| `POST /admin/skills` | Add skill record |
| `POST /admin/skills/:skillId/versions` | Submit skill version contract |
| `POST /admin/skills/versions/:versionId/approve` | Activate approved skill version |
| `POST /admin/skills/assignments` | Assign skill version to role/scenario/scope |
| `POST /admin/skills/resolve` | Simulate skill selection |

## 8. Acceptance Criteria

- [x] Admin UI includes Knowledge and Skill Governance section.
- [x] Knowledge Library shows source metadata, scope, index and active version.
- [x] Version Approval shows immutable hash, changelog, approval and audit evidence.
- [x] Scoped Retrieval shows filters and allow/deny reason.
- [x] Skill Library and Skill Versioning show active/disabled states and contract details.
- [x] Skill Assignment shows role/scenario/scope selected skill and knowledge set.
- [x] Workspace Context shows selected skillVersionId and knowledgeVersionIds.
- [x] Desktop and mobile screenshot evidence are captured.
- [x] Console capture has 0 errors and 0 warnings.
