# Enterprise Vibe Coding Platform — MVP Redesign (Creator-First)

Version: 1.0
Date: 2026-07-06
Status: Design approved in brainstorm, pending spec review
Language: Thai primary with English technical terms
Base: ตัด scope จาก `docs/requirements/production-blueprint-requirements.md` (v0.3)

## 1. เป้าหมายและบริบท

สร้าง MVP ที่เป็น **Enterprise version ของ Lovable/bolt.diy** สำหรับ pilot จริงในองค์กร 1 แห่ง บน private server โดยโฟกัสที่ **Creator vibe coding loop ที่ทำงานจริง**: กด create project → AI generate code → ไฟล์ถูกเก็บจริง → app รัน/preview/publish ได้จริง โดยใช้ database และ storage ภายใต้สิทธิ์ที่ IT กำหนด

ทีมพัฒนา: AI agent-driven (คนเดียว + AI) — ใช้ open source ที่มีอยู่แทนการเขียนใหม่ให้มากที่สุด

### Success criteria

1. ติดตั้งบน private server ด้วย docker compose แล้วใช้งานได้จริง (auth จริง, AI จริง)
2. Business Creator สร้าง project แล้วได้ Next.js app ที่รันจริง มี database schema และ storage bucket ของตัวเอง
3. Creator iterate ด้วย prompt, เห็น diff/ไฟล์/preview แบบ real-time, ย้อน code กลับได้
4. Publish app ให้ end user ในองค์กรใช้ผ่าน URL ภายใต้ Platform Auth
5. IT เห็น audit log และควบคุมสิทธิ์/quota ได้จากส่วนกลาง

### Non-goals ของ MVP นี้

- Shell command allowlist + network egress hardening (accepted risk — backlog อันดับต้น)
- Guardrail UI + policy approval workflow (มีแค่ audit log)
- App Store PWA flow เต็ม (request access, ticket, notification) — ใช้ app membership ตรง
- PRD lifecycle / baseline / change request
- Knowledge/Skill management, License module, Backup drill UI
- Realtime collab หลายคนต่อ project (single-editor lock, คนที่สอง read-only)
- Image attachment / voice prompt / prompt enhancer
- แยก data ต่อ environment (โครง URL + Environment record รองรับไว้แล้ว)
- SLA, multi-stack, Kubernetes

## 2. Baseline decisions

| Area | Decision |
| --- | --- |
| ฐาน scope | ตัดจาก production blueprint v0.3, reuse codebase/monorepo เดิม |
| เป้าหมายแรก | Pilot จริง 1 องค์กร (real install, real auth, real AI) |
| Execution model | Server-side Docker container ต่อ project (ตาม ADR-003) ไม่ใช้ WebContainer |
| Reference architecture | bolt.diy — ยืม artifact/action streaming protocol, message parser, action runner, workbench UI structure, context management |
| Multi-provider LLM | LiteLLM (self-hosted, open source) เป็น AI Gateway — virtual key/quota/usage log ต่อ project |
| Agentic engine | เริ่มจาก harness แบบ bolt.diy (system prompt + artifact protocol) ฝั่ง server; ประเมิน OpenHands SDK เป็น option เสริมภายหลัง |
| Generated app stack | **Next.js (App Router) + TypeScript + Prisma + Tailwind ตัวเดียว** (ปรับจาก FR-CRE-007 เดิมที่แยก React+NestJS) |
| Version control | git ต่อ project ซ่อนใต้ Checkpoint UX, ไม่ rewrite history |
| Preview/Publish access | URL ผ่าน Caddy + Platform Auth เท่านั้น ไม่ expose port |
| Governance ขั้นต่ำ | Auth (Keycloak) + สิทธิ์ db/storage ต่อ project + audit log |
| Secrets | Platform จัดการทั้งหมด Creator ไม่เห็น/ไม่ต้องจัดการ key เอง |

## 3. High-Level Architecture

```
┌──────────────┐   SSE/WebSocket    ┌─────────────────────────────────────┐
│ creator-web   │◄──────────────────►│ platform-api                        │
│ (Workbench UI │   stream: chat +   │  ├─ Chat/Generation route (SSE)     │
│  แบบ bolt.diy)│   file/action      │  ├─ Message Parser + Action Runner  │──┐
└──────────────┘   events           │  ├─ Workspace Orchestrator (module)  │  │
                                    │  └─ Auth (Keycloak) + Audit         │  │
                                    └──────────┬──────────────────────────┘  │
                                               │ Docker Engine API            │ LLM calls
                                    ┌──────────▼──────────────┐   ┌──────────▼─────────┐
                                    │ Project Container (dev)  │   │ LiteLLM Gateway    │
                                    │  /workspace (git files)  │   │  virtual key/proj  │
                                    │  next dev (internal)     │   │  quota + usage log │
                                    │  scoped DB/S3 creds      │   │  multi-provider    │
                                    └──────┬──────────────────┘   └────────────────────┘
                                           │
                              ┌────────────┼────────────┐
                              │ Postgres   │ MinIO      │  Caddy:
                              │ schema/proj│ bucket/proj│   /preview/{slug}/ → dev
                              └────────────┴────────────┘   /apps/{slug}/    → prod
```

หลักการ:

1. **ยืม protocol ของ bolt.diy** — LLM ตอบเป็น artifact/action stream, parser ฝั่ง platform-api แกะและ execute ใน project container แล้ว relay event (file created, shell output, preview ready) กลับ workbench ผ่าน SSE
2. **Container ต่อ project** สร้างโดย Workspace Orchestrator พร้อม provision: Postgres schema + DB role ที่เห็นเฉพาะ schema ตัวเอง, MinIO bucket + scoped key, LiteLLM virtual key + quota — จุดที่ "IT ควบคุมสิทธิ์"
3. **LiteLLM แทน AI Gateway mock เดิม** — multi-provider, quota, usage log โดยไม่เขียนเอง
4. **Auth + Audit ใช้ของเดิม** — Keycloak ใน compose + audit persistence layer ที่มีแล้ว

### 3.1 Preview/Production URL (ไม่ expose port)

- Container ทุกตัวอยู่ internal Docker network ไม่ publish port ออก host
- ทุก request ผ่าน Caddy → platform-api ตรวจ session + สิทธิ์ → reverse proxy เข้า container
- URL structure เผื่อ multi-env ตั้งแต่วันแรก:
  - `/preview/{slug}/` = dev environment
  - `/apps/{slug}/` = production
  - อนาคต: `/staging/{slug}/`
- Data model มี `Environment` record (`dev|staging|production`) ผูกกับ deployment ตั้งแต่ MVP แม้ใช้จริงแค่ dev/production
- Preview iframe ใน workbench ใช้ session cookie เดียวกับ platform (same-origin ผ่าน path)

### 3.2 Source Version Control & Rollback

**git ต่อ project ซ่อนใต้ Checkpoint UX:**

- ทุก AI turn ที่ apply artifact สำเร็จ → auto-commit (message: `AI: <สรุป prompt>`, author: identity ของ Creator)
- Creator กด "Save Checkpoint" → git tag `checkpoint/N` + label
- Deployment record อ้าง commit SHA (traceability ตาม FR-PRD-004)
- Workbench โชว์ diff ต่อ turn จาก git diff ตรงๆ

**Rollback แบบ audit-safe:**

- Creator เห็น timeline (ไม่เห็นคำว่า git) → กด "ย้อนกลับจุดนี้"
- ระบบสร้าง **revert commit** (restore tree) — ไม่ rewrite history เด็ดขาด
- Audit event `code.rollback` พร้อม from/to commit + preview refresh อัตโนมัติ
- **Boundary:** ย้อนได้เฉพาะ code — ถ้าช่วงที่ย้อนข้าม database migration ระบบ **block** พร้อมคำอธิบาย ให้ Creator สั่ง prompt แก้ schema แทน (ขยายจาก ADR-008 เป็น full-code restore เพราะ Next.js รวม frontend+backend)
- ยังไม่ทำใน MVP: branch UI, merge, PR review (โครง git รองรับแล้ว)

## 4. Workspace Orchestrator + Provisioning

Module ใหม่ใน platform-api (ไม่แยก service) คุยกับ Docker Engine API ผ่าน socket

### 4.1 Create Project flow

```
1. สร้าง Project record + git repo จาก golden template
2. Provision แบบ atomic:
   ├─ Postgres: CREATE SCHEMA app_{slug} + DB role เห็นเฉพาะ schema นี้
   ├─ MinIO: bucket proj-{slug} + access key scope เฉพาะ bucket
   └─ LiteLLM: virtual key ของ project + token quota ที่ IT ตั้ง
3. Start dev container:
   ├─ image กลาง (Node + pnpm + template dependencies preinstalled → เปิดเร็ว)
   ├─ mount workspace volume (git checkout)
   ├─ inject secrets เป็น env: DATABASE_URL, S3_*, PLATFORM_AUTH_*
   └─ internal network เท่านั้น
4. ลงทะเบียน route /preview/{slug}/ → container:3000
5. ขั้นไหน fail → rollback ทุกอย่างที่สร้างแล้ว + error ชัดเจน
```

### 4.2 Golden template (Next.js)

- Next.js App Router + TypeScript + Prisma + Tailwind + Platform Auth SDK
- ฝังมาแล้ว: Prisma datasource ชี้ schema ของ project, MinIO client ชี้ bucket ของ project, auth wiring
- **Locked files** — AI และ Creator แก้ไม่ได้: `platform.config.ts`, auth wiring, prisma datasource block, env plumbing
- AI generate เฉพาะ feature code บน template ไม่ generate boilerplate/infrastructure

### 4.3 Secrets (Creator ไม่จัดการ key เอง)

- Secret ทั้งหมด generate อัตโนมัติตอน provision เก็บใน platform schema แบบ encrypted at rest
- Inject เป็น env ตอน start container — code อ้าง `process.env.*` ผ่านไฟล์ที่ lock ไว้
- UI แสดงเฉพาะ **ชื่อ** env ที่มีให้ใช้ (สำหรับอ้างใน prompt) ไม่แสดงค่า ตลอดชีวิต project
- Admin rotate ได้ → orchestrator restart container พร้อมค่าใหม่
- สอดคล้อง NFR-SEC-001; ห้าม secret ลง git

### 4.4 Container lifecycle + resource limits

| State | ความหมาย | Transition |
| --- | --- | --- |
| `provisioning` | กำลังสร้างทรัพยากร | → running / failed |
| `running` | dev server ทำงาน | → idle (ไม่มี activity 30 นาที) |
| `idle` | container stop, volume/ข้อมูลครบ | → running (wake ~10-20 วิ ตอนเปิด workspace) |
| `archived` | project archive | volume เก็บไว้ ทรัพยากรอื่นหยุด |

- Default limit ต่อ dev container (config ได้): CPU 1 core, RAM 2GB, disk quota 2GB
- Admin service health dashboard เดิม เพิ่มรายการ container ต่อ project
- ลบ project → cleanup: container, volume, schema (soft-delete ตาม retention), bucket, virtual key

### 4.5 Accepted risk (MVP)

Shell execution ใน container: non-root user + internal network + egress เฉพาะ npm registry — **ยังไม่มี command allowlist / registry proxy** เป็น backlog security อันดับต้นก่อนขยาย pilot

## 5. Generation Loop

### 5.1 Flow ต่อ 1 prompt

```
Creator พิมพ์ prompt → POST /projects/{id}/chat (SSE stream กลับ)
  1. โหลด chat history จาก Postgres + rolling summary
  2. Context selection: LLM เลือกไฟล์เกี่ยวข้อง ≤5 ไฟล์ (pattern bolt.diy select-context)
  3. ประกอบ system prompt:
     ├─ กติกา artifact format (<artifact>/<action type="file|shell|migration">)
     ├─ Next.js template constraints + โครงสร้างไฟล์ปัจจุบัน
     ├─ รายชื่อ env vars (ชื่ออย่างเดียว) + Prisma schema ปัจจุบัน
     └─ locked files list
  4. เรียก LiteLLM ด้วย virtual key ของ project → stream
        ↓
Message Parser (streaming) แกะ <action> ระหว่าง stream → Action Runner ทันที
        ↓
Action Runner → exec ใน dev container:
  ├─ type="file"      → เขียนไฟล์ (ปฏิเสธ locked file → แจ้ง AI turn ถัดไป)
  ├─ type="shell"     → รันคำสั่ง stream stdout/stderr กลับ
  └─ type="migration" → prisma migrate dev + บันทึก migration record
        ↓
จบ turn: auto-commit git + refresh preview + AI usage log + audit
```

ทุก event (text token, file written, shell output, commit) relay ผ่าน SSE เดียว → workbench เห็น real-time

### 5.2 Context management (ยืมจาก bolt.diy)

1. **System prompt เข้มงวด** — constraint environment ทั้งหมด, artifact rules, holistic thinking, ห้าม code นอก artifact
2. **Rolling chat summary** — สรุปบทสนทนาเก่าเป็น structured summary แล้ว slice ข้อความเก่า (pattern `create-summary.ts`)
3. **Context buffer ≤5 ไฟล์** — LLM เลือกไฟล์เกี่ยวข้องต่อ request (pattern `select-context.ts`)
4. **Starter template** — ไม่ให้ AI generate boilerplate
5. **Locked files** — enforce ฝั่ง server ที่ Action Runner (ไม่ใช่แค่ prompt)

### 5.3 Error feedback loop

| จุดดัก | วิธี | UX |
| --- | --- | --- |
| Shell/build fail | exit code + stderr จาก action runner | AI เห็น error ใน turn เดียวกัน แก้เองสูงสุด 2 รอบ แล้วหยุดถาม Creator |
| Dev server crash / compile error | อ่าน log stream ของ `next dev` | Banner ใน preview + ปุ่ม "Fix with AI" |
| Runtime error ใน browser | overlay script ใน preview iframe จับ `window.onerror` + `console.error` | ปุ่ม "Fix with AI" ส่ง error เข้า prompt |

### 5.4 Chat history ฝั่ง server

- `WorkspaceChatMessage`: project, role, content, artifact refs, commit SHA, token usage
- `WorkspaceChatSummary`: rolling summary ล่าสุดต่อ project
- เปิดจากเครื่องไหนก็ต่อได้ + ผูก audit ครบ (ต่างจาก bolt.diy ที่ใช้ IndexedDB)

### 5.5 Database migration flow

- Migration ที่ AI สร้าง → รันผ่าน action `type="migration"` → เก็บ record (ชื่อ, SQL, commit, timestamp)
- โชว์ใน Database View UI เดิม (Sprint 5)
- เป็นเงื่อนไข block code rollback ที่ข้าม migration

## 6. Publish ไป Production

```
Creator กด Publish
  1. Pre-publish checks (อัตโนมัติ ไม่มี approval workflow ใน MVP):
     ├─ next build ผ่านใน dev container
     ├─ pending migration apply แล้ว
     └─ git working tree สะอาด
  2. Build production image: checkout commit → next build --standalone
     → artifact ผูก commit SHA
  3. Start production container (แยกจาก dev):
     ├─ resource limit production (default: CPU 1, RAM 1GB)
     ├─ secrets ชุดเดียวกัน + NODE_ENV=production
     └─ ใช้ Postgres schema + MinIO bucket เดียวกับ dev (MVP ยังไม่แยก data ต่อ env)
  4. ลงทะเบียน /apps/{slug}/ → production container
     + Deployment record (commit, image, ผู้ publish, เวลา) + audit event
  5. Health check ผ่าน → สลับ traffic / fail → คง version เก่า + แจ้ง error
```

- **Re-publish** = flow เดิม ได้ Deployment record ใหม่ ดู history ได้
- **Rollback deployment** = publish commit เก่า (image เก็บไว้)
- **สิทธิ์เข้า published app**: Platform Auth + **app membership** (reuse ตาราง/UI app users/roles จาก Sprint 6) — Creator เพิ่ม user เอง
- ข้อจำกัดจงใจ: dev/production ใช้ database เดียวกัน — แยก data ต่อ env เป็น phase ถัดไป

## 7. Components สรุป

| Component | สถานะ | งาน |
| --- | --- | --- |
| creator-web Workbench | ปรับใหม่ | Chat panel + file tree/code view + diff + terminal log + preview iframe + checkpoint timeline (โครง UI จาก bolt.diy stores pattern) |
| platform-api Chat route | ใหม่ | SSE endpoint, system prompt assembly, summary, context selection |
| Message Parser + Action Runner | ใหม่ (port จาก bolt.diy) | แกะ artifact stream, execute ใน container, relay events |
| Workspace Orchestrator | ใหม่ | Docker lifecycle, provisioning, secrets injection, route registration |
| Golden template | ใหม่ | Next.js + Prisma + Auth SDK + locked files |
| LiteLLM | นำเข้า (OSS) | compose service ใหม่ + virtual key per project |
| Preview/Apps proxy | ใหม่ | auth-checked reverse proxy ใน platform-api + Caddy config |
| Publish pipeline | ใหม่ | build image, production container, deployment record |
| Keycloak auth | มีอยู่ | ต่อ OIDC browser flow จริงให้จบ (แทน simulated SSO bridge) |
| Audit log | มีอยู่ | เพิ่ม event types ใหม่ (chat, action, commit, rollback, publish, provision) |
| Postgres/MinIO/Caddy/compose | มีอยู่ | เพิ่ม LiteLLM service + Docker socket access ให้ platform-api |

## 8. Data model เพิ่มใหม่ (platform schema)

- `WorkspaceContainer`: project, state (provisioning/running/idle/archived/failed), containerId, resource config, lastActivityAt
- `ProjectSecret`: project, name, encryptedValue, rotatedAt
- `ProjectResource`: project, type (pg_schema|s3_bucket|llm_key), identifier, status
- `Environment`: project, name (dev|staging|production), routePath, status
- `WorkspaceChatMessage`, `WorkspaceChatSummary` (ตาม 5.4)
- `CodeCheckpoint`: project, gitTag, commitSha, label, createdBy
- `MigrationRecord`: project, name, sql, commitSha, appliedAt
- `Deployment` (ขยายของเดิม): environment, commitSha, imageTag, publishedBy, healthStatus

## 9. Testing

- Unit: message parser (stream แตกกลาง tag), action runner dispatch, locked-file enforcement, context selection contract, orchestrator provisioning state machine (mock Docker API)
- Integration: create project → provision (Postgres/MinIO จริงใน compose) → container start → chat round-trip กับ LiteLLM dry-run/mock provider → commit → rollback → publish
- E2E smoke: install compose → login Keycloak → create project → prompt เล็ก → เห็นไฟล์+preview → publish → เปิด /apps/{slug}
- Security checks: preview URL ไม่มี session → 401, Creator A เข้า project B → 403, DB role ของ app A อ่าน schema B ไม่ได้, secret ไม่โผล่ใน API response/git

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Shell ไม่มี allowlist (accepted) | non-root + internal network + egress npm เท่านั้น; backlog อันดับต้น |
| LLM output ไม่ตรง artifact format | ยืม parser + prompt ที่ผ่านการพิสูจน์จาก bolt.diy, มี retry/error path |
| Container หนักเกิน server | resource limits + idle timeout ตั้งแต่วันแรก |
| dev/prod ใช้ DB เดียวกัน | ระบุเป็นข้อจำกัดที่สื่อสารกับ pilot ชัดเจน; Environment record เตรียมโครงแยกไว้แล้ว |
| Keycloak OIDC จริงยังไม่เคย wire จบ | เป็นงานชิ้นแรกๆ ใน plan เพราะทุก surface พึ่ง auth |

## 11. อ้างอิง

- `docs/requirements/production-blueprint-requirements.md` v0.3 (ฐาน scope)
- ADR-003 (container + schema isolation), ADR-008 (restore boundary — ขยายเป็น full-code)
- bolt.diy: `app/lib/runtime/message-parser.ts`, `action-runner.ts`, `app/lib/.server/llm/create-summary.ts`, `select-context.ts`, `app/lib/common/prompts/prompts.ts`, `app/lib/persistence/lockedFiles.ts`
- LiteLLM (self-hosted LLM gateway), OpenHands (ตัวเลือก engine ภายหลัง), Open Lovable / Dyad (reference implementations)
