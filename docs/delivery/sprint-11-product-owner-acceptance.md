# Sprint 11 Product Owner Acceptance Gate

Version: 0.1
Date: 2026-07-04
Status: Accepted pending Principal review

## 1. Acceptance Principle

Sprint 11 is accepted only if knowledge and skill governance works as an integrated production blueprint contract: approved active knowledge is retrievable by scope, approved active skills are resolved by assignment, disabled/pending records are excluded, workspace prompts carry exact version metadata, and the full regression suite remains green.

## 2. Required Evidence

| Gate | Evidence Required | Status |
| --- | --- | --- |
| Knowledge source/version/approval lifecycle works | Unit and E2E/API output | Passed focused tests |
| Retrieval filters by actor/project/app/department/role/scenario | Unit and E2E/API output | Passed focused tests |
| Skill lifecycle, version contract, assignment and disable behavior works | Unit and E2E/API output | Passed focused tests |
| Workspace prompt returns knowledge and skill metadata | Unit and E2E/API output | Passed focused tests |
| Prisma migration and seed include Sprint 11 records | Integration test and DB query output | Passed |
| Admin Knowledge and Skill Governance UI renders required sections | E2E/UI and screenshot evidence | Passed |
| Sprint 0-10 regression tests remain green | `pnpm verify:sprint11` | Passed |

## 3. Product Owner Checklist

- [x] Knowledge library supports supported source metadata with owner, scope, upload and index status.
- [x] Knowledge versions include content hash, changelog, approval status and lifecycle status.
- [x] Approval activates one version and supersedes previous active version.
- [x] Retrieval returns only approved active indexed knowledge.
- [x] Retrieval denial reasons are explicit and no restricted content leaks.
- [x] Skill library supports draft, active and disabled records.
- [x] Skill versions include instruction, input schema, output schema, required knowledge and allowed tools.
- [x] Skill approval activates an immutable version.
- [x] Skill assignment resolves by agent role, scenario and scope.
- [x] Disabled skills and pending versions are excluded from resolution.
- [x] Workspace prompt metadata includes selected knowledge and skill evidence.
- [x] Admin UI includes Knowledge Library, Version Approval, Scoped Retrieval, Skill Library, Skill Versioning, Skill Assignment and Workspace Context.
- [x] Full verification gate passes.
- [x] Database migration and seed are verified against PostgreSQL.
- [x] Screenshot and console evidence are captured.
- [ ] Principal Engineer review approves the PR.

## 4. Verification Evidence

Commands to execute before acceptance:

```bash
pnpm verify:sprint11
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @evcp/platform-api exec prisma generate --schema prisma/schema.prisma
docker compose -f docker/docker-compose.yml up -d postgres
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL='postgresql://evcp:evcp@127.0.0.1:5432/evcp?schema=public' pnpm --filter @evcp/platform-api seed
pnpm dev:admin
```

Current results:

| Evidence | Result |
| --- | --- |
| Focused Sprint 11 unit tests | Passed: 3/3 |
| Focused Sprint 11 integration tests | Passed: 4/4 |
| Focused Sprint 11 E2E/API/UI smoke tests | Passed: 4/4 |
| Typecheck | Passed: 10 workspace projects |
| Platform API build | Passed |
| Admin Web build | Passed |
| Prisma validate | Passed |
| Prisma generate | Passed |
| `pnpm verify:sprint11` | Passed: lint, typecheck, build, unit 53/53, integration 38/38, e2e 39/39 |
| Prisma migrate deploy | Passed: applied `20260703000010_sprint11_knowledge_skill_governance` |
| Prisma seed | Passed |
| DB count query | `knowledge_sources=1`, `knowledge_versions=1`, `knowledge_approvals=1`, `knowledge_index_chunks=1`, `knowledge_retrieval_logs=1`, `skill_definitions=1`, `skill_versions=1`, `skill_approvals=1`, `skill_assignments=1` |
| Playwright console capture | 0 errors, 0 warnings; see `docs/assets/screenshots/sprint11-console-warnings.txt` |
| UI screenshot evidence | `docs/assets/screenshots/sprint11-knowledge-skill-governance.png`, `docs/assets/screenshots/sprint11-knowledge-skill-governance-mobile.png` |

## 5. Rejection Rules

Reject Sprint 11 if:

- Knowledge retrieval returns pending, rejected, superseded or unauthorized knowledge.
- Knowledge approval overwrites immutable history instead of creating/superseding versions.
- Skill resolution returns disabled skills or pending/rejected/superseded versions.
- Workspace prompt can complete without auditable context metadata when approved assignments exist.
- Admin routes leak restricted skill instruction or knowledge excerpts to unauthorized actors.
- Prisma schema, migration or seed records are missing.
- Admin UI omits any required governance section or mobile layout clips evidence.
- Regression from a previous accepted sprint breaks without documented exception.

## 6. Product Owner Decision

Accepted pending Principal review. Sprint 11 is approved for review because knowledge and skill governance now works across service, API, schema, seed data and Admin UI; approved active context is selected and recorded, disabled/pending records are excluded, database evidence is present, screenshot/console evidence is captured, and the full Sprint 0-11 regression suite passes.
