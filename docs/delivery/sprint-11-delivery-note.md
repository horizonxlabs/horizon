# Sprint 11 Delivery Note

Date: 2026-07-04
Branch: `codex/sprint-11-knowledge-skill-governance`
Issue: #15
Scope: Knowledge library/version/approval/retrieval, skill library/version/approval/assignment, workspace context metadata, Prisma contract and Admin UI.

## Delivered Scope

- Added `KnowledgeGovernanceService` for source metadata, immutable versions, approval activation, scoped retrieval and retrieval logs.
- Added `SkillGovernanceService` for skill records, immutable version contracts, approval activation, assignments, resolution and disabled exclusion.
- Integrated Creator workspace prompt results with `knowledgeRetrieval`, `skillSelection`, task `knowledgeVersionIds` and `skillVersionId`.
- Added Platform API routes for `/admin/knowledge/*` and `/admin/skills/*`.
- Added Prisma schema, migration and seed data for knowledge sources, versions, approvals, index chunks, retrieval logs, skill definitions, skill versions, approvals and assignments.
- Added Admin Knowledge and Skill Governance UI using shared design-system components and responsive CSS.
- Added Sprint 11 unit, integration and E2E/API/UI smoke tests while preserving previous sprint regression checks.
- Updated sprint planning, UI spec, test plan, traceability, design system, acceptance docs and changelog.

## Verification

Primary gate:

```bash
pnpm verify:sprint11
```

Result: Passed on 2026-07-04.

Focused checks completed during implementation:

| Gate | Evidence |
| --- | --- |
| Sprint 11 unit tests | Passed: 3/3 |
| Sprint 11 integration tests | Passed: 4/4 |
| Sprint 11 E2E/API/UI smoke tests | Passed: 4/4 |
| Typecheck | Passed: 10 workspace projects |
| Platform API build | Passed |
| Admin Web build | Passed |
| Prisma validate | Passed with local `DATABASE_URL` |
| Prisma generate | Passed |
| Full `pnpm verify:sprint11` | Passed: lint, typecheck, build, unit 53/53, integration 38/38, e2e 39/39 |

Database verification to execute before acceptance:

```bash
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
```

Sprint 11 count evidence:

| Table | Count |
| --- | ---: |
| `knowledge_sources` | 1 |
| `knowledge_versions` | 1 |
| `knowledge_approvals` | 1 |
| `knowledge_index_chunks` | 1 |
| `knowledge_retrieval_logs` | 1 |
| `skill_definitions` | 1 |
| `skill_versions` | 1 |
| `skill_approvals` | 1 |
| `skill_assignments` | 1 |

UI evidence:

- `docs/assets/screenshots/sprint11-knowledge-skill-governance.png`
- `docs/assets/screenshots/sprint11-knowledge-skill-governance-mobile.png`
- `docs/assets/screenshots/sprint11-console-warnings.txt`

## Product Owner Decision

Accepted pending Principal review. Sprint 11 meets the production blueprint knowledge/skill governance gate across service, API, schema, seed data and Admin UI: approved active knowledge is retrievable by scope, approved active skills resolve by assignment, disabled/pending records are excluded, workspace prompts carry exact version metadata, and the full Sprint 0-11 regression suite passes.
