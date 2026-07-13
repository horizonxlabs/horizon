# Horizon — MVP Pending Tasks

อัปเดตสถานะ: 2026-07-13  
เป้าหมาย: เปลี่ยน integrated mock-first prototype ให้เป็น MVP สำหรับ pilot บน private server ที่พิสูจน์ flow จริงได้

## 1. สถานะและสมมติฐาน

เอกสารนี้เรียงงานตามลำดับการลงมือทำตั้งแต่ setup ถึง release ไม่ได้ถือว่า Sprint 0–14 ยังไม่ได้ทำ สถานะอ้างอิงจาก `main` commit `bc177ad` (`v0.2.1`), เอกสาร operations/specs, implementation และการทดสอบ local Compose/Keycloak ที่ตรวจเมื่อ 2026-07-13

- `[x]` ทำแล้วระดับ prototype/foundation
- `[~]` ทำบางส่วน แต่ยังไม่ผ่าน real/pilot gate
- `[ ]` ยังต้องทำ

> `docs/mvp_backlog.md` และ `docs/original_prd.md` เป็น untracked files ขณะตรวจ จึงใช้เป็น product input แต่ใช้ `README.md`, `docs/operations/real-mvp-*.md`, code และ tests บน `main` เป็นหลักฐานสถานะ

### Baseline ที่มีแล้ว

- [x] Monorepo, shared packages, 3 frontend surfaces, Platform API, Prisma schema/migrations, Compose และ verification scripts
- [x] Prototype flow Admin governance → Creator/PRD/workspace → publish → App Store/ticket → ticket-to-PRD พร้อม Sprint 0–14 regression evidence
- [x] Repository-shaped persistence, signed bearer-session, AI adapter, API bootstrap และ deterministic memory mode
- [x] Real workspace adapters สำหรับ Docker/PostgreSQL/MinIO/LiteLLM, generation loop, Git checkpoint และ container publish foundation
- [~] Real Keycloak/OIDC ใช้งานได้แล้วสำหรับ Admin และ Creator; แต่หลายหน้า/service ยังพึ่ง static demo data, legacy/in-memory state หรือยังไม่มี browser E2E บน private-server stack จริง

### หลักฐานที่ตรวจเพิ่มเมื่อ 2026-07-13

- [x] Local Compose stack เปิดได้: PostgreSQL, Redis, MinIO, Keycloak, LiteLLM, Platform API, Admin, Creator, Store และ Caddy
- [x] Health และ Caddy routes ที่ทดสอบตอบปกติ: `/api/health`, Keycloak discovery ใต้ `/auth`, และ 3 web surfaces
- [x] Real Keycloak login สำหรับ Admin และ Creator: สร้าง Creator จาก Admin ได้ และหลัง login ถูกส่งไป `http://localhost:8088/creator/`
- [~] การทดสอบนี้เป็น local development evidence: มี restart/migration/seed และ unauthenticated OIDC-start smoke evidence แล้ว แต่ยังไม่ได้พิสูจน์ clean private-server install, credentialed Store browser login หรือ critical flow หลัง restart แบบครบวงจร

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

- [~] Start PostgreSQL, Redis, MinIO, Keycloak, LiteLLM, Platform API, 3 web surfaces และ Caddy (ผ่านบน local Compose; ยังต้องยืนยันบน clean private server)
- [~] รัน `prisma migrate deploy` และ idempotent seed โดยปิด demo project เว้นแต่ opt-in (ยืนยันบน local Compose แล้ว รวม Keycloak provider seed; ยังต้อง rerun บน clean private server)
- [~] ตรวจ health/readiness และ Caddy routes (ผ่าน local); ยังต้องตรวจ private-network exposure และ volume behavior ตามสภาพแวดล้อม pilot
- [~] รัน install verification และ restart stack หนึ่งรอบเพื่อยืนยัน volume persistence (ผ่าน local Compose; clean-host evidence ยังเหลือ)

**Exit gate:** ทุก service healthy; migration/seed rerun ได้; restart แล้วข้อมูลและ volumes ยังอยู่  
**ทำขนานได้:** smoke test MinIO, database connectivity และ observability collection

### Phase 3 — ทำ Real Keycloak/OIDC และ Platform Auth

**Dependencies:** Phase 2  
**Checklist:**

- [~] ทำ browser redirect/callback/token exchange สำหรับ Admin, Creator และ App Store (Admin/Creator browser-tested; Store code path ยังต้องทดสอบจริง)
- [x] persist/revoke/expire/refresh Platform Auth sessions ด้วย PostgreSQL พร้อม refresh rotation, reuse-family revocation, logout และ Admin session revoke UI
- [~] enforce platform role, app role และ resource scope ใน protected APIs (role mapping ใช้งานได้; ยังต้องพิสูจน์ทุก protected resource และ negative cases)
- [x] ปิด simulated-login route และลบ mock-header/session-bridge fallback จาก pilot configuration (default ปิด; test mode ต้อง opt-in ชัดเจน)
- [~] เพิ่ม PostgreSQL auth integration tests และ browser login/logout/expiry E2E (route/rotation/revoke contracts และ unauthenticated OIDC-start browser smoke ผ่านแล้ว; credentialed logout, expiry และ full browser E2E ยังเหลือ)

**Exit gate:** ทั้ง 3 surfaces ใช้ real login เท่านั้น; invalid/expired/revoked token ถูกปฏิเสธ; restart ไม่ทำ policy เพี้ยน  
**ทำขนานได้:** frontend callback UX และ security/redaction tests

### Phase 4 — ย้าย authoritative state และ secrets ไป persistent stores

**Dependencies:** Phase 2; session records พึ่ง Phase 3  
**Checklist:**

- [x] ทำ route/service inventory: `prisma`, `memory-test-only`, `legacy-to-remove` (`docs/operations/phase-4-state-inventory.md`)
- [~] ย้าย AI providers/keys/routes/quota/usage และ business state ที่เหลือไป Prisma repositories (session, migration evidence และ workspace lifecycle ย้ายแล้ว; generation run/approval ledger และ legacy adapters ยังเหลือ)
- [~] เพิ่ม migration/rollback notes และ real-PostgreSQL route-level integration suite (migration/ADR/evidence มีแล้ว; clean PostgreSQL route-level suite ยังเหลือ)
- [ ] เปลี่ยน local secret envelope เป็น production KMS/secret-store ก่อนรับ customer provider key
- [~] ทดสอบ restart persistence, idempotency, tenant/project/app scoping และ cross-scope denial (session rotation/reuse, migration/runtime hydration และ API denial contracts ผ่าน; full real-stack scope/restart E2E ยังเหลือ)

**Exit gate:** pilot ใช้ `EVCP_CORE_PERSISTENCE=prisma`; ไม่มี authoritative state ใน process memory; secrets ไม่ออกจาก server boundary  
**ทำขนานได้:** repository migration แยกตาม domain และ backup/restore test fixtures

### Phase 5 — ย้าย frontend จาก demo data ไป Platform API

**Dependencies:** Phase 3–4 และ stable API contracts  
**Checklist:**

- [ ] ทำ API wiring matrix ครบ Admin, Creator และ App Store
- [ ] Creator: database/version, ticket/trace, workspace usage/preview และ publish/access ใช้ API-backed state
- [ ] Admin: monitoring, audit, auth/domain/operations และ AI governance อ่าน/เขียนข้อมูลจริง
- [ ] App Store: list/detail/install/access/ticket/status ใช้ current session และ database-backed APIs
- [ ] จำกัด fallback เฉพาะ explicit local-dev; เพิ่ม loading/empty/denied/retry/stale-session states

**Exit gate:** fresh pilot install ไม่มี demo record โดยไม่ opt-in; reload/restart แล้วยังตรง DB; API failure ไม่คืน fake success  
**ทำขนานได้:** แบ่งตาม 3 surfaces หลัง API contracts freeze

### Phase 6 — ทำ governed live AI path

**Dependencies:** Phase 4; UI test-call พึ่ง Phase 5  
**Checklist:**

- [ ] route workspace/frontend/backend/review/documentation scenarios ผ่าน gateway เดียว
- [ ] persist routing, fallback, tokens, latency, cost, status และ sanitized failure evidence
- [ ] เพิ่ม provider timeout, bounded retry/circuit breaker และ async worker สำหรับงานยาว
- [ ] ทำ quota consumption ระดับ organization/project/app และ block ก่อน external call เมื่อหมด
- [ ] ทดสอบ prompt/response guardrail, provider failure/fallback และ no-secret leakage

**Exit gate:** Admin test call และ Creator ใช้ config เดียวกัน; retry ไม่สร้าง artifact/usage ซ้ำ; usage trace กลับหา actor/project/provider ได้  
**ทำขนานได้:** provider adapter tests, cost/quota model และ worker orchestration

### Phase 7 — พิสูจน์ real workspace และ generation loop

**Dependencies:** Phase 3–6  
**Checklist:**

- [ ] Create project แล้ว provision schema, DB user, bucket, LiteLLM key และ isolated container จริง
- [ ] ส่ง prompt ให้ AI แก้ไฟล์, validate/build, Git commit และ refresh preview จริง
- [ ] ตรวจ locked files, membership, names-only secret list และ schema/bucket isolation
- [ ] ทดสอบ partial-provision rollback, restart recovery, idle stop/wake และ orphan cleanup
- [ ] ทดสอบ restore boundary; block การย้อน code ข้าม incompatible DB migration พร้อม recovery guidance

**Exit gate:** Creator สร้าง/แก้ app โดย fixture ไม่ใช่ authoritative output; restart ไม่ทำ source/chat/checkpoint หาย; failure รักษา last-known-good preview  
**ทำขนานได้:** isolation negative tests, recovery tests และ restore UX

### Phase 8 — Publish, runtime และ end-user access

**Dependencies:** Phase 7; auth/access policy จาก Phase 3  
**Checklist:**

- [ ] build versioned image/artifact และผูก source commit, manifest, deployment revision
- [ ] publish ผ่าน internal route โดยไม่ expose container port ตรง
- [ ] enforce Platform Auth/app membership และตรวจ health/readiness ก่อนเปิด route
- [ ] ทดสอบ failed publish, app restart และ rollback ไป previous healthy revision
- [ ] ยืนยัน App Store แสดง/เปิด app ตามสิทธิ์จาก persistent registry

**Exit gate:** end user ที่มีสิทธิ์เปิด published app ได้; ผู้ไม่มีสิทธิ์ถูก deny; rollback กู้ healthy route โดยไม่กระทบ app อื่น  
**ทำขนานได้:** runtime probes, access negative tests และ deployment/audit trace

### Phase 9 — ปิด feedback loop เมื่ออยู่ใน cutline

**Dependencies:** Phase 5 และ Phase 8  
**Checklist:**

- [ ] End user ส่ง/ติดตาม ticket จาก published app
- [ ] Creator เห็นเฉพาะ ticket ของ app ที่ดูแล และ convert เป็น PRD change/AI prompt
- [ ] ป้องกัน duplicate conversion และ trace ticket → PRD change → source commit → deployment
- [ ] ทดสอบ request-access/invite/role lifecycle หาก sponsor กำหนดเป็น release blocker

**Exit gate:** feedback round-trip ผ่านด้วย persistent data และ audit trail  
**ทำขนานได้:** ถ้า Phase 0 ตัดออกจาก first pilot ให้รันเป็น prototype regression และไม่ block Phase 10

### Phase 10 — E2E, security, backup และ release

**Dependencies:** Phase 1–8; Phase 9 เฉพาะเมื่ออยู่ใน cutline  
**Checklist:**

- [ ] รัน `pnpm check:ci`, relevant verify suites และ `pnpm verify:real-mvp-install` จาก clean checkout
- [ ] Browser E2E: real login → create → live AI change → preview → publish → end-user open app
- [ ] รัน flow ซ้ำหลัง service restart; ทดสอบ provider/registry outage และ generated-app rollback
- [ ] ทำ backup/restore drill ครบ PostgreSQL, MinIO artifacts, Keycloak config และ release evidence
- [ ] security review: auth/RBAC, TLS, secrets/log redaction, uploads, cross-schema denial และ app isolation
- [ ] สรุป versions/digests, known limitations, operator runbook และ reproducible pass/fail evidence

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
- [ ] test/demo flags ปิดโดย default ใน pilot release
- [ ] audit trace เชื่อม actor → project/app → AI usage → source commit → deployment
- [ ] คนอื่นทำ clean install, happy path, restart, backup/restore และ rollback ตาม runbook ได้
- [ ] Product Owner, Security และ Ops ยอมรับ known limitations

## 7. แหล่งอ้างอิงสถานะ

`README.md`; `docs/operations/real-mvp-{install,persistence,auth-session,ai-provider-adapter,frontend-api-bootstrap}.md`; Creator-first design และ approved specs ใต้ `docs/superpowers/specs/`; `docs/delivery/production-candidate-readiness.md`
