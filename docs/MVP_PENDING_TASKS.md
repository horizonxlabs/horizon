# Horizon — MVP Pending Tasks

อัปเดตสถานะ: 2026-07-14
เป้าหมาย: เปลี่ยน integrated mock-first prototype ให้เป็น MVP สำหรับ pilot บน private server ที่พิสูจน์ flow จริงได้

## 1. สถานะและสมมติฐาน

เอกสารนี้เรียงงานตามลำดับการลงมือทำตั้งแต่ setup ถึง release ไม่ได้ถือว่า Sprint 0–14 ยังไม่ได้ทำ สถานะอ้างอิงจาก `main` commit `bc177ad` (`v0.2.1`), เอกสาร operations/specs และ implementation ที่ตรวจเมื่อ 2026-07-13

- `[x]` ทำแล้วระดับ prototype/foundation
- `[~]` ทำบางส่วน แต่ยังไม่ผ่าน real/pilot gate
- `[ ]` ยังต้องทำ

> `docs/mvp_backlog.md` และ `docs/original_prd.md` เป็น untracked files ขณะตรวจ จึงใช้เป็น product input แต่ใช้ `README.md`, `docs/operations/real-mvp-*.md`, code และ tests บน `main` เป็นหลักฐานสถานะ

### Baseline ที่มีแล้ว

- [x] Monorepo, shared packages, 3 frontend surfaces, Platform API, Prisma schema/migrations, Compose และ verification scripts
- [x] Prototype flow Admin governance → Creator/PRD/workspace → publish → App Store/ticket → ticket-to-PRD พร้อม Sprint 0–14 regression evidence
- [x] Repository-shaped persistence, signed bearer-session, AI adapter, API bootstrap และ deterministic memory mode
- [x] Real workspace adapters สำหรับ Docker/PostgreSQL/MinIO/LiteLLM, generation loop, Git checkpoint และ container publish foundation
- [~] Phase 3–9 software path และ local real-stack evidence ผ่านแล้ว; ยังเหลือ clean-pilot infrastructure ownership และ release certification ใน Phase 0–2/10

## 2. Execution Plan — ทำตามลำดับ

### Phase 0 — ยืนยัน scope และ setup decisions

**Dependencies:** ไม่มี  
**Checklist:**

- [ ] Product Owner เลือก authoritative cutline: Creator-first real pilot หรือ original feedback loop เต็ม
- [ ] ระบุ pilot owner, environment, target IdP, provider/model, DNS/TLS, registry และ release evidence owner
- [ ] ตัดสินใจ production KMS/secret store, session policy, quota scope และ backup retention
- [ ] บันทึก accepted risk เรื่อง shell/network egress และเงื่อนไขที่ห้าม public exposure

**Exit gate:** มี signed-off cutline, environment sheet, secret ownership และ pass/fail criteria  
**ทำขนานได้:** threat model, test matrix และ hardware sizing

### Phase 1 — เตรียม clean private server

**Dependencies:** Phase 0  
**Checklist:**

- [ ] จัดเครื่องสะอาดตาม OS/CPU/RAM/disk ที่ตกลง พร้อม Docker Compose v2, DNS, TLS และ registry access
- [ ] สร้าง `.env` จาก `.env.example`; เปลี่ยน example/default secrets ทั้งหมดและจำกัด file permissions
- [ ] รัน `pnpm install:preflight`, `pnpm install:plan` และตรวจ port/storage/network prerequisites
- [ ] เตรียม backup destination, log retention และ time synchronization

**Exit gate:** preflight ผ่านโดยไม่มี default secret; DNS/TLS/storage/registry พร้อมใช้งาน  
**ทำขนานได้:** build/push versioned images และเตรียม Keycloak realm/client config

### Phase 2 — เปิด infrastructure และฐานข้อมูล

**Dependencies:** Phase 1  
**Checklist:**

- [ ] Start PostgreSQL, Redis, MinIO, Keycloak, LiteLLM, Platform API, 3 web surfaces และ Caddy
- [ ] รัน `prisma migrate deploy` และ idempotent seed โดยปิด demo project เว้นแต่ opt-in
- [ ] ตรวจ health/readiness, private network, volumes, Caddy routes และไม่ expose internal ports เกินสัญญา
- [ ] รัน install verification และ restart stack หนึ่งรอบเพื่อยืนยัน volume persistence

**Exit gate:** ทุก service healthy; migration/seed rerun ได้; restart แล้วข้อมูลและ volumes ยังอยู่  
**ทำขนานได้:** smoke test MinIO, database connectivity และ observability collection

### Phase 3 — ทำ Real Keycloak/OIDC และ Platform Auth

**Dependencies:** Phase 2  
**Checklist:**

- [x] ทำ browser redirect/callback/token exchange สำหรับ Admin, Creator และ App Store; local Keycloak browser proof ผ่านครบ 3 surface
- [x] persist/revoke/expire/refresh Platform Auth sessions ด้วย PostgreSQL และ restart แล้วยังใช้ session เดิมได้
- [x] enforce platform role, app role และ resource scope ใน protected APIs รวม generated-app proxy แบบ 401/403/member-only
- [x] ปิด simulated-login/mock-header ใน pilot configuration; เปิดได้เฉพาะ explicit test mode
- [x] เพิ่ม PostgreSQL auth integration tests และ local browser login/logout/revoke E2E; clean-pilot hostname proof อยู่ Phase 10

**Exit gate:** ทั้ง 3 surfaces ใช้ real login เท่านั้น; invalid/expired/revoked token ถูกปฏิเสธ; restart ไม่ทำ policy เพี้ยน  
**ทำขนานได้:** frontend callback UX และ security/redaction tests

### Phase 4 — ย้าย authoritative state และ secrets ไป persistent stores

**Dependencies:** Phase 2; session records พึ่ง Phase 3  
**Checklist:**

- [x] ทำ route/service inventory: `prisma`, `memory-test-only`, `legacy-to-remove` ใน `docs/operations/phase-4-state-inventory.md`
- [x] ย้าย AI providers/keys/routes/quota/usage, durable AI jobs, project uploads และ generation checkpoints ไป persistent repositories
- [x] เพิ่ม migrations, rollback boundary และ PostgreSQL route/repository integration contracts; clean-pilot restore certification อยู่ Phase 10
- [x] ใช้ OpenBao KV v2 สำหรับ provider credentials; database เก็บเพียง secret reference และ local restart recovery ผ่าน
- [x] ทดสอบ local restart persistence, idempotency, project/app scoping และ cross-scope denial

**Exit gate:** pilot ใช้ `EVCP_CORE_PERSISTENCE=prisma`; ไม่มี authoritative state ใน process memory; secrets ไม่ออกจาก server boundary  
**ทำขนานได้:** repository migration แยกตาม domain และ backup/restore test fixtures

### Phase 5 — ย้าย frontend จาก demo data ไป Platform API

**Dependencies:** Phase 3–4 และ stable API contracts  
**Checklist:**

- [x] ทำ API wiring matrix ครบ Admin, Creator และ App Store — ดู `docs/operations/phase-5-api-wiring-matrix.md`; local real-Keycloak browser proof ผ่าน
- [x] Creator: database/version, ticket/trace, workspace usage/preview และ publish/access ใช้ API-backed state; default demo ถูกปิด และ preview ใช้ HttpOnly path-scoped session โดยไม่มี bearer token ใน URL
- [x] Admin: monitoring, audit, auth/domain/operations และ AI governance อ่าน/เขียนข้อมูลจริง; provider/key/route/quota/guardrail/test-call ผ่าน browser กับ OpenBao/Anthropic
- [x] App Store: list/detail/install/access/ticket/status ใช้ current session และ database-backed APIs; local login/logout/revoke และ fail-closed empty state ผ่าน
- [x] จำกัด fallback เฉพาะ explicit local-dev; loading/empty/denied/retry/stale-session เป็น fail-closed และ frontend contract/render suites ผ่าน

**Exit gate:** fresh pilot install ไม่มี demo record โดยไม่ opt-in; reload/restart แล้วยังตรง DB; API failure ไม่คืน fake success  
**ทำขนานได้:** แบ่งตาม 3 surfaces หลัง API contracts freeze

### Phase 6 — ทำ governed live AI path

**Dependencies:** Phase 4; UI test-call พึ่ง Phase 5  
**Checklist:**

- [x] ทั้ง 6 scenarios (`prd_generation`, `requirement_analysis`, `frontend_coding`, `backend_coding`, `review`, `documentation`) ผ่าน governed executor กับ Anthropic จริงและ route/model เดียวกัน
- [x] persist routing, fallback, tokens, latency, cost, status และ sanitized failure evidence ใน PostgreSQL; actor/project/provider trace ถูกตรวจแล้ว
- [x] provider timeout, bounded retry/circuit breaker และ durable async worker: encrypted payload, heartbeat, expired-lease reclaim, restart recovery และ exactly-one evidence ผ่าน
- [x] quota consumption ระดับ organization/project/app และ block ก่อน external call เมื่อหมด; live hard-stop proof ไม่เพิ่ม succeeded evidence
- [x] prompt guardrail, provider failure/fallback และ no-secret leakage ผ่าน live proof; credential อยู่ใน OpenBao และ DB เก็บเพียง `vault://` reference/masked value

**Exit gate:** Admin test call และ Creator ใช้ config เดียวกัน; retry ไม่สร้าง artifact/usage ซ้ำ; usage trace กลับหา actor/project/provider ได้  
**ทำขนานได้:** provider adapter tests, cost/quota model และ worker orchestration

### Phase 7 — พิสูจน์ real workspace และ generation loop

**Dependencies:** Phase 3–6  
**Checklist:**

- [x] Workspace credentials เข้ารหัส AES-GCM และ persist ก่อน recreate; real adapter fail-closed เมื่อไม่มี operator-injected encryption key
- [x] Local Creator สร้าง project และ provision schema, DB user, bucket, LiteLLM key และ isolated container จริง
- [x] Local live AI แก้ไฟล์, validate/build, Git commit, สร้าง immutable Prisma checkpoint และ refresh token-free preview จริง
- [x] locked files, project membership, names-only secret list และ schema/bucket isolation มี negative contracts
- [x] partial-provision rollback, restart recovery, idle stop/wake และ labelled orphan cleanup มี regression proof
- [x] rollback block เมื่อ code เก่ากว่า applied migration โดยไม่ checkout source และคืน recovery guidance

**Exit gate:** Creator สร้าง/แก้ app โดย fixture ไม่ใช่ authoritative output; restart ไม่ทำ source/chat/checkpoint หาย; failure รักษา last-known-good preview  
**ทำขนานได้:** isolation negative tests, recovery tests และ restore UX

### Phase 8 — Publish, runtime และ end-user access

**Dependencies:** Phase 7; auth/access policy จาก Phase 3  
**Checklist:**

- [x] build versioned image/tag ผูก source commit และ deployment revision; persisted product manifest/registry ผูก project/app revision
- [x] publish/preview ผ่าน Caddy → Platform API → internal container โดย release Compose publish เฉพาะ ingress ports
- [x] generated-app proxy บังคับ Platform Auth/app membership และ route เฉพาะ healthy deployment
- [x] failed publish, restart rehydration, promote และ migration-safe rollback มี regression contracts
- [x] App Store list/detail/install/access ใช้ persistent registry และ open action ถูก authorize ซ้ำที่ generated-app proxy

**Exit gate:** end user ที่มีสิทธิ์เปิด published app ได้; ผู้ไม่มีสิทธิ์ถูก deny; rollback กู้ healthy route โดยไม่กระทบ app อื่น  
**ทำขนานได้:** runtime probes, access negative tests และ deployment/audit trace

### Phase 9 — ปิด feedback loop เมื่ออยู่ใน cutline

**Dependencies:** Phase 5 และ Phase 8  
**Checklist:**

- [x] Persistent App Store path รองรับ end user ส่ง/ติดตาม ticket ของ published app
- [x] Creator inbox scope ตาม project/app และมี ticket-to-PRD/AI regression path
- [~] duplicate ticket conversion มี regression proof; full persistent trace ticket → PRD → source commit → deployment ยังต้องยืนยันใน clean browser E2E
- [x] request-access/invite/role/install lifecycle ใช้ persistent repository และมี access-denial contracts

**Exit gate:** feedback round-trip ผ่านด้วย persistent data และ audit trail  
**ทำขนานได้:** ถ้า Phase 0 ตัดออกจาก first pilot ให้รันเป็น prototype regression และไม่ block Phase 10

### Phase 10 — E2E, security, backup และ release

**Dependencies:** Phase 1–8; Phase 9 เฉพาะเมื่ออยู่ใน cutline  
**Checklist:**

- [ ] รัน `pnpm check:ci`, relevant verify suites และ `pnpm verify:real-mvp-install` จาก clean checkout
- [ ] Browser E2E: real login → create → live AI change → preview → publish → end-user open app
- [~] Local restart, provider outage/fallback, durable reclaim และ generated-app rollback contracts ผ่าน; registry outage บน pilot ยังเหลือ
- [~] Local encrypted PostgreSQL/MinIO restore ผ่าน; external destination/retention และ Keycloak export/restore ยังเหลือ
- [~] auth/RBAC, secret redaction, uploads และ app isolation มี contracts; public TLS/cross-host review ต้องทำบน pilot
- [~] operator runbooks และ local evidence อัปเดตแล้ว; final image digests/versions และ pilot sign-off ยังเหลือ

**Exit gate:** ไม่มี open Critical/High หรือ P0 data-loss defect; critical flow ผ่าน 2 รอบ; backup/rollback proof ตรวจซ้ำได้  
**ทำขนานได้:** security review, ops drill และ documentation evidence หลัง release candidate freeze

## 3. MVP Cutline

### Must Have — Creator-first real pilot

- Real Compose install, Keycloak/OIDC, PostgreSQL/MinIO persistence และ secret-store boundary
- Governed real AI call พร้อม quota/guardrail/usage evidence
- Creator create → prompt → code/build → preview → checkpoint/restore → publish
- Generated-app isolation, Platform Auth/app membership, healthy internal URL และ Admin audit visibility
- Browser E2E, restart, backup/restore และ rollback proof

### Conditional

App Store request access, support ticket, ticket-to-PRD และ PRD lifecycle แบบเต็มเป็น Must Have ใน backlog เดิม แต่ Creator-first design ลดออกจาก first real pilot ให้ Product Owner ตัดสินใน Phase 0; ถ้าไม่เลือก ให้คงเป็น regression/fast follow

### Defer

Knowledge/Skill, Remix, PRD export, push notification, Durable LangGraph, advanced approvals, realtime collaboration, Docker Swarm control plane, Kubernetes, multi-framework, native app, marketplace และ advanced ABAC

## 4. งานหลัง first pilot

- **Live AI progress UX:** lifecycle SSE, stalled/recovery states และ accessible activity trace; ทำหลัง Phase 6–7 contracts เสถียร
- **Durable LangGraph:** persistent run/action/approval ledger, Postgres checkpointer, replayable SSE และ lease worker; approved design only
- **Docker Swarm control plane:** signed digest, deployment/update jobs, Traefik readiness และ per-app rollback; approved design only

## 5. ความเสี่ยงหลัก

| Risk | Gate / Mitigation |
| --- | --- |
| Demo fallback ซ่อน API failure | pilot config ห้าม fallback; browser E2E ตรวจ DB |
| State แยกระหว่าง memory กับ Prisma | inventory + Prisma-only pilot + restart tests |
| Provider secret รั่ว | KMS/secret store + masking/redaction + server-only boundary |
| AI retry สร้าง artifact/usage ซ้ำ | idempotency/fingerprint + bounded retry |
| Restore ข้าม migration | migration-aware block + manual recovery |
| Cross-app data exposure | scoped credentials + negative isolation E2E |
| Scope เปลี่ยนกลาง release | signed-off Phase 0 cutline |

## 6. Definition of Done

- [ ] Phase 0–10 exit gates ผ่านตาม cutline พร้อม evidence
- [x] test/demo flags ปิดโดย default ใน pilot release
- [ ] audit trace เชื่อม actor → project/app → AI usage → source commit → deployment
- [ ] คนอื่นทำ clean install, happy path, restart, backup/restore และ rollback ตาม runbook ได้
- [ ] Product Owner, Security และ Ops ยอมรับ known limitations

## 7. แหล่งอ้างอิงสถานะ

`README.md`; `docs/operations/real-mvp-{install,persistence,auth-session,ai-provider-adapter,frontend-api-bootstrap}.md`; Creator-first design และ approved specs ใต้ `docs/superpowers/specs/`; `docs/delivery/production-candidate-readiness.md`
