# Enterprise Vibe Coding Platform - Production Blueprint Requirements

Version: 0.1  
Date: 2026-07-03  
Status: Requirements Baseline Draft  
Language: Thai primary with English technical terms  
Scope: Production Blueprint for Single Enterprise / Private Server

## 1. Purpose

เอกสารนี้กำหนด requirements ระดับ Production Blueprint สำหรับ Enterprise Vibe Coding Platform ซึ่งเป็น private AI application builder สำหรับองค์กร ให้ Business Creator สร้าง internal web application ด้วย AI ได้ โดย IT/System Admin ยังคงควบคุม identity, access, security, AI provider, guardrail, data policy, deployment, monitoring, audit และ lifecycle ของ generated apps ได้จากส่วนกลาง

เอกสารนี้ใช้เป็น baseline ก่อนเริ่ม development และก่อนแตกเป็น implementation backlog, architecture design, test plan และ release plan

## 2. Baseline Decisions

| Area | Decision |
| --- | --- |
| Requirement level | Production Blueprint |
| Deployment model | Single Enterprise / Private Server |
| Network model | Online Private Server |
| AI model support | External AI providers only |
| AI Gateway architecture | Provider Adapter Architecture, เพิ่ม provider ภายหลังได้ |
| Auth / SSO | OIDC + SAML + Local break-glass admin |
| Identity broker | รองรับทั้ง bundled Keycloak และ external IdP/direct integration |
| Generated app runtime | Separate app container ต่อ generated app |
| Generated app data isolation | Shared PostgreSQL database, schema per app |
| Source code model | Monorepo เดียว รวม platform และ generated apps |
| Production orchestration | Docker Compose v1, migration-ready สำหรับ Kubernetes ภายหลัง |
| Publish governance | Policy-based approval |
| Data classification | Public / Internal / Confidential / Restricted |
| Audit retention | Admin configurable, default 1 year |
| Backup / DR | Configurable schedule + PostgreSQL PITR + restore drill + retention policy |
| Object storage | Bundled MinIO + optional external S3-compatible storage |
| Observability | Architecture รองรับ metrics/logs/traces/alerts, v1 UI เริ่มจาก health/log/audit |
| Generated app stack | Production v1 ล็อก stack เดียว, เปิดทาง multi-stack plugin ภายหลัง |
| Code editing | Business Creator ใช้ prompt/config, Developer role ใช้ code editor ภายใต้ governance |
| Review roles | Policy-based: App Owner, IT Admin, Security Admin, Developer Reviewer, Data Owner |
| Knowledge Management | Library + indexing + permission-filtered retrieval + versioning + approval |
| Skill Management | Library + versioning + assignment + approval workflow |
| App Store visibility | Membership, role/access, group-restricted, organization-wide, pending invite/request |
| Ticket SLA | ไม่อยู่ใน production v1 |
| Notifications | Architecture multi-channel, v1 ใช้ in-app + email |
| Installer / Upgrade | CLI installer + Local Web Setup Wizard + preflight/report/backup-before-upgrade/rollback |
| Domain / TLS | Path-based default + TLS + internal/custom domains + public domain approval |
| External users | รองรับ external users + public access policy + approval |
| Licensing | Full license module |
| Success metrics | Balanced scorecard |

## 3. Problem Statement

องค์กรต้องการสร้าง internal applications ได้เร็วขึ้นโดยไม่ทำให้ IT backlog เพิ่มขึ้น แต่การเปิดให้ Business User สร้าง app เองมีความเสี่ยงด้าน security, identity, data access, AI key exposure, compliance, deployment และ operational ownership หากไม่มี platform กลางที่บังคับมาตรฐานเดียวกัน

Enterprise Vibe Coding Platform ต้องแก้ปัญหานี้ด้วย private AI software factory ที่ให้ Creator สร้าง app ผ่าน browser ได้ ขณะที่ทุก app ถูกผูกกับ central auth, app-level role, PRD lifecycle, approval policy, audit, guardrail, deployment traceability และ internal app store

## 4. Goals

G1. ลดเวลาในการสร้าง internal application โดยให้ Creator สามารถสร้าง PRD, preview, invite user และ publish app ผ่าน web workflow ได้ครบถ้วน  
G2. ลด IT backlog โดยให้ Business Unit สร้างและดูแล app ภายใต้ policy ที่ IT กำหนดได้เอง  
G3. บังคับ governance กลางสำหรับ identity, app access, AI provider/key, guardrail, data classification, audit และ deployment  
G4. ทำให้ generated apps ใช้งานจริงบน private server ได้ โดยแยก runtime container ต่อ app และแยก database schema ต่อ app  
G5. สร้าง feedback loop จาก End User ticket กลับไปเป็น PRD change request และ app change ได้อย่าง traceable  
G6. ทำให้ production operation ครบถ้วนพอสำหรับ private server ได้แก่ install, backup, restore, upgrade, rollback, monitoring, audit และ license control

## 5. Non-Goals for Production v1

NG1. ไม่รองรับ multi-tenant SaaS deployment ใน v1 เพราะ baseline คือ one enterprise per private deployment  
NG2. ไม่บังคับรองรับ Local LLM / Ollama / vLLM ใน v1 เพราะ baseline คือ external AI providers only  
NG3. ไม่รองรับ Kubernetes เป็น production runtime หลักใน v1 แต่ architecture ต้องไม่ปิดทาง migration ภายหลัง  
NG4. ไม่รองรับ multiple generated app stacks ใน v1 แต่ template/skill architecture ต้องเปิดทาง future plugin  
NG5. ไม่ต้องมี ticket SLA, business-hour calendar หรือ auto-escalation ใน v1  
NG6. ไม่ต้องมี third-party marketplace สำหรับ skills/templates/plugins ใน v1  
NG7. Creator ไม่สามารถใช้ raw SQL editor หรือ bypass auth/permission guard ได้

## 6. Personas

### 6.1 IT/System Admin

ผู้ดูแล platform, private server, installer, domain, SSO, backup, upgrade, monitoring, license, AI provider, guardrail และ global governance

### 6.2 Security Admin

ผู้กำหนด security policy, guardrail, restricted data approval, public/external exposure approval และ security audit

### 6.3 AI Admin

ผู้จัดการ AI providers, models, API keys, scenario routing, quota, fallback, AI usage logs, knowledge และ skill assignments

### 6.4 App Owner

เจ้าของ business app มีสิทธิ์ approve access, role, low-risk publish และดูแล feedback ของ app

### 6.5 Creator / Business User

ผู้สร้าง app ผ่าน prompt/config workflow, PRD, live preview, database view, invite, publish request และ ticket-to-PRD flow

### 6.6 Developer

ผู้มีสิทธิ์แก้ generated app code ใน web code editor หรือ governed workspace ภายใต้ project/app scope, review, build/test gate และ audit

### 6.7 Data Owner

ผู้อนุมัติการใช้งาน Confidential/Restricted data, retention, export, access และ data-related publish policy

### 6.8 End User

พนักงานหรือ external user ที่เข้า App Store เพื่อเปิด app, request access, submit ticket และ track ticket status

## 7. Product Surfaces

### 7.1 IT/System Admin Software

ต้องเป็น Web Admin Console พร้อม installer/setup experience สำหรับจัดการ platform กลาง ได้แก่ system health, services, users/groups, auth/SSO, AI providers/API keys, scenario routing, quotas, guardrails, knowledge, skills, domains, deployments, backup/restore, upgrade, license, monitoring และ audit logs

### 7.2 Creator App

ต้องเป็น web desktop application สำหรับสร้างและดูแล app ผ่าน AI ได้แก่ project picker, create project, prompt builder, live preview, PRD lifecycle, database view, frontend version restore, code editor สำหรับ Developer role, app users/roles, publish request, token usage และ ticket inbox

### 7.3 End User App Store PWA

ต้องเป็น Progressive Web App สำหรับ End User ใช้ค้นหาและเปิด app ตามสิทธิ์, request access, view app detail, submit ticket, track ticket status, receive notification และติดตั้งเป็น PWA ได้

## 8. Functional Requirements

### 8.1 Installation, Setup, Upgrade

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-INST-001 | ระบบต้องมี CLI installer สำหรับ private server | P0 | Admin run installer ได้, installer ตรวจ prerequisites และสร้าง install report |
| FR-INST-002 | ระบบต้องมี Local Web Setup Wizard | P0 | Admin ตั้ง domain, database, storage, auth, AI gateway, guardrail, backup และ first admin ได้ |
| FR-INST-003 | ระบบต้อง deploy production v1 ด้วย Docker Compose | P0 | Compose stack start services หลักได้: platform API, web apps, PostgreSQL, Keycloak, MinIO, Redis, Caddy |
| FR-INST-004 | ระบบต้องมี preflight check | P0 | ตรวจ CPU, RAM, disk, OS, Docker, Compose, ports, DNS, TLS readiness และ network |
| FR-INST-005 | ระบบต้องมี upgrade/rollback command | P0 | Upgrade ต้อง backup-before-upgrade, health check หลัง upgrade และ rollback ได้เมื่อ upgrade fail |
| FR-INST-006 | Architecture ต้อง migration-ready สำหรับ Kubernetes | P1 | Business logic ไม่ hardcode Compose-only container names หรือ local paths ที่ย้ายไม่ได้ |

### 8.2 Authentication and Identity

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-AUTH-001 | ระบบต้องรองรับ OIDC SSO | P0 | Admin configure OIDC provider ได้, user login ผ่าน IdP ได้, role/group mapping ทำงาน |
| FR-AUTH-002 | ระบบต้องรองรับ SAML SSO | P0 | Admin configure SAML metadata/cert ได้, user login ผ่าน SAML IdP ได้ |
| FR-AUTH-003 | ระบบต้องมี Local break-glass admin | P0 | Admin fallback login ได้เมื่อ SSO unavailable และ event ถูก audit |
| FR-AUTH-004 | ระบบต้องรองรับ bundled Keycloak | P0 | Installer deploy Keycloak และ platform ใช้เป็น identity broker ได้ |
| FR-AUTH-005 | ระบบต้องรองรับ external IdP/direct integration | P1 | Admin เลือกต่อ external OIDC/SAML IdP ได้โดยไม่บังคับใช้ bundled Keycloak |
| FR-AUTH-006 | Generated apps ต้องใช้ Platform Auth | P0 | Generated app ห้ามสร้าง password store แยก และต้อง validate session/token ผ่าน platform auth |

### 8.3 Role and Access Control

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-ACCESS-001 | ระบบต้องมี platform roles | P0 | รองรับ Platform Admin, AI Admin, Security Admin, Developer, Creator, Viewer |
| FR-ACCESS-002 | ระบบต้องมี project roles | P0 | รองรับ Project Owner, Editor, Reviewer, Viewer |
| FR-ACCESS-003 | ระบบต้องมี app-level roles ต่อ app | P0 | App Owner/Creator สร้าง app roles เช่น Employee, Manager, HR Admin ได้ |
| FR-ACCESS-004 | App Store visibility ต้อง permission-based | P0 | User เห็นเฉพาะ app ที่เข้าตาม membership, group, organization-wide, pending invite/request |
| FR-ACCESS-005 | Creator ต้องไม่เห็น global AI key หรือ system config | P0 | Creator route/API access ไป admin config ต้องถูก block และ audit permission denied |
| FR-ACCESS-006 | External users ต้องอยู่ภายใต้ app-level policy | P0 | External invite/public access ต้องผ่าน approval และ audit |

### 8.4 AI Provider and AI Gateway

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-AI-001 | AI Gateway ต้องใช้ Provider Adapter Architecture | P0 | Provider adapter เพิ่มใหม่ได้โดยไม่แก้ core routing contract |
| FR-AI-002 | Production v1 ต้องรองรับ external AI providers | P0 | Admin เพิ่ม provider, base URL, model, API key และ status ได้ |
| FR-AI-003 | API key ต้องมี usage mode, scenario, quota, fallback | P0 | Admin route Requirement Analysis, Coding, Review, Documentation ไป key/model ต่างกันได้ |
| FR-AI-004 | Creator ต้องไม่เห็น API key secret | P0 | UI/API ไม่ส่ง key material ให้ non-admin role |
| FR-AI-005 | ระบบต้อง log AI usage | P0 | เก็บ user, project, scenario, model, tokens, cost estimate, latency, status |
| FR-AI-006 | External-only v1 ต้องไม่ require local model | P0 | Install และ AI workflow ใช้งานได้โดยไม่มี local LLM component |

### 8.5 Guardrail and AI Policy

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-GRD-001 | ระบบต้องรองรับ rule-based guardrail | P0 | Admin สร้าง banned keyword, regex, PII/secret pattern rule ได้ |
| FR-GRD-002 | ระบบต้องรองรับ AI policy guardrail | P0 | Admin กำหนด disallowed behavior เช่น bypass auth, dump database, export sensitive data ได้ |
| FR-GRD-003 | Guardrail actions ต้อง configurable | P0 | รองรับ allow, warn, block, require approval, notify/escalate |
| FR-GRD-004 | Prompt ต้องผ่าน guardrail ก่อนเรียก AI provider | P0 | Blocked prompt ไม่ถูกส่งไป external provider และมี event log |
| FR-GRD-005 | Guardrail events ต้อง audit ได้ | P0 | Admin filter events ตาม user, project, severity, action, date ได้ |

### 8.6 Data Classification and Governance

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-DATA-001 | Project/app ต้องมี data classification | P0 | Creator/App Owner เลือก Public, Internal, Confidential, Restricted ได้ |
| FR-DATA-002 | Data classification ต้อง drive approval policy | P0 | Confidential/Restricted publish, external access, public domain, export ต้องขอ approval ตาม policy |
| FR-DATA-003 | Data Owner role ต้องใช้กับ data-sensitive workflow | P0 | Confidential/Restricted data access/export/publish สามารถ require Data Owner approval ได้ |
| FR-DATA-004 | Generated app data ต้องแยก schema per app | P0 | App A database user/connection ไม่สามารถอ่าน schema ของ App B ได้ |
| FR-DATA-005 | Platform metadata ต้องอยู่ใน schema กลาง | P0 | Platform users, projects, apps, audit, AI config อยู่ใน platform schema |

### 8.7 Project and PRD Lifecycle

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-PRD-001 | ทุก project ต้องมี PRD | P0 | Create project แล้วระบบสร้าง PRD draft และต้อง confirm baseline ก่อน serious generation/publish |
| FR-PRD-002 | PRD ต้องมี versioning | P0 | ระบบเก็บ v0.1 draft, v1.0 baseline, minor/major updates และ change summary |
| FR-PRD-003 | Requirement/behavior change ต้องสร้าง PRD change request | P0 | Prompt หรือ ticket ที่เปลี่ยน requirement สร้าง change request พร้อม affected sections |
| FR-PRD-004 | Deployment ต้อง trace ไป PRD version | P0 | Deployment record มี prdVersionId, frontend checkpoint, manifest version, git commit/image tag |
| FR-PRD-005 | Ticket ต้อง convert เป็น PRD change request ได้ | P0 | Creator เลือก ticket แล้วระบบสร้าง PRD change proposal ให้ review/approve |

### 8.8 Creator Workspace and Generated App Development

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-CRE-001 | Creator ต้องสร้าง project ผ่าน browser ได้ | P0 | Create project wizard เก็บ app name, business problem, app type, intended users, data sensitivity |
| FR-CRE-002 | Creator ต้อง prompt AI และเห็น task progress | P0 | Workspace แสดง steps เช่น load PRD, retrieve knowledge, update PRD, generate frontend/backend, run checks |
| FR-CRE-003 | Creator ต้องเห็น live preview | P0 | Preview refresh ได้และรองรับ desktop/tablet/mobile preview |
| FR-CRE-004 | Creator ต้องเห็น database view แบบ business-friendly | P0 | Schema/table/relationship/sample records/migration history ดูได้โดยไม่มี raw SQL |
| FR-CRE-005 | Frontend restore ต้องกระทบเฉพาะ frontend | P0 | Restore ไม่เปลี่ยน backend, database, auth, app roles, membership, domain, PRD baseline เว้นแต่ confirm |
| FR-CRE-006 | Developer role ต้องใช้ code editor ได้ภายใต้ governance | P0 | Code edit ถูกจำกัด project scope, audit, review/build/test gate และห้าม bypass auth/permission |
| FR-CRE-007 | Generated app stack v1 ต้องเป็นมาตรฐานเดียว | P0 | React + Vite + TypeScript, NestJS + Prisma, PostgreSQL schema per app, Platform Auth SDK |

### 8.9 Generated App Runtime, Deployment, Domain

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-RUN-001 | Published generated app ต้อง run เป็น separate container | P0 | แต่ละ app มี container/process, health, logs, route และ deployment record แยก |
| FR-RUN-002 | Routing default ต้องรองรับ path-based routing | P0 | `/admin`, `/creator`, `/store`, `/apps/{slug}`, `/preview/{projectSlug}` ใช้งานได้ |
| FR-RUN-003 | Reverse proxy ต้องจัดการ TLS ได้ | P0 | Caddy หรือ equivalent จัดการ TLS config และ route registration ได้ |
| FR-RUN-004 | ระบบต้องรองรับ internal/custom domain per app | P0 | App Owner ขอ domain ได้และ Admin approve/reject ได้ |
| FR-RUN-005 | Public/custom domain ต้องมี approval workflow | P0 | Domain request มี DNS/TLS/security checks และ audit log |
| FR-RUN-006 | Publish ต้อง policy-based approval | P0 | Approval path เปลี่ยนตาม data classification, external/public access, schema migration, security risk |

### 8.10 App Store and External Users

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-STORE-001 | End User App Store ต้องเป็น PWA | P0 | มี manifest, app shell caching, offline fallback และ responsive mobile-first UI |
| FR-STORE-002 | User ต้องเห็น My Apps และ Available Apps ตาม permission | P0 | Membership apps, organization-wide apps, group-restricted apps, pending invites/requests แสดงถูกต้อง |
| FR-STORE-003 | User ต้อง request access ได้ | P0 | Request มี reason, requested role, status tracking และ route ไป App Owner/Creator |
| FR-STORE-004 | User ต้อง open app ที่มีสิทธิ์ได้ | P0 | App launch ถูก audit และ permission guard บังคับใช้ |
| FR-STORE-005 | External users ต้องใช้ app ได้ตาม policy | P0 | External invite/public access flow ทำงานและถูก audit |

### 8.11 Support Ticket and Feedback Loop

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-TKT-001 | End User ต้อง submit ticket ได้ | P0 | Ticket มี type, title, description, priority, screenshot optional, device/browser info |
| FR-TKT-002 | Ticket ต้อง route ไป Creator/App Owner | P0 | Bug/Feedback/Feature ไป Creator/App Owner, Security Concern ไป Security Admin + App Owner |
| FR-TKT-003 | Ticket ต้องมี status timeline | P0 | Status logs, comments, attachments และ assignee ถูกเก็บ |
| FR-TKT-004 | End User ต้อง track ticket status ได้ | P0 | User เห็น ticket ของตนเองและ status ล่าสุด |
| FR-TKT-005 | Creator ต้อง convert ticket เป็น PRD change request ได้ | P0 | Ticket linked กับ project_prd_change_request และ audit event ถูกสร้าง |
| FR-TKT-006 | SLA/auto-escalation ไม่อยู่ใน v1 | P2 | ระบบไม่ต้องมี SLA timers, business hours หรือ auto-escalation |

### 8.12 Knowledge Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-KNW-001 | ระบบต้องมี Knowledge Library | P0 | Admin/authorized user upload/manage PDF, Markdown, Text, Word, Excel, OpenAPI JSON ได้ |
| FR-KNW-002 | Knowledge ต้องมี scope และ permission | P0 | Scope รองรับ global, department, project, app, agent และ retrieval ต้อง filter ตาม permission |
| FR-KNW-003 | Knowledge ต้อง indexing สำหรับ AI retrieval | P0 | AI Agent retrieve relevant knowledge ตาม user/project/scenario ได้ |
| FR-KNW-004 | Knowledge ต้องมี versioning | P0 | Update knowledge แล้วเก็บ version, changelog, owner, approval status |
| FR-KNW-005 | Knowledge update ต้องมี approval workflow | P0 | Publish knowledge version ต้องผ่าน approval ตาม policy และ audit |

### 8.13 Agent Skill Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-SKL-001 | ระบบต้องมี Skill Library | P0 | Admin เพิ่ม/แก้/disable skill ได้ |
| FR-SKL-002 | Skill ต้องมี versioning | P0 | Skill version มี instruction, input/output schema, required knowledge, allowed tools |
| FR-SKL-003 | Skill ต้อง assign ตาม agent role/scenario/scope ได้ | P0 | Requirement Analyst, Database Designer, Frontend Developer, Security Reviewer ฯลฯ ใช้ skill ตาม scenario |
| FR-SKL-004 | Skill update ต้องมี approval workflow | P0 | New/changed skill ต้อง review/approve ก่อน active |
| FR-SKL-005 | Skill changes ต้อง audit | P0 | Add/update/approve/assign/disable มี audit log |

### 8.14 Notification

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-NOTI-001 | Notification architecture ต้องรองรับหลาย channel | P1 | Contract รองรับ in-app, email, webhook, Slack/Teams, push ภายหลัง |
| FR-NOTI-002 | Production v1 ต้องรองรับ in-app notification | P0 | User เห็น invite, access request, approval, ticket, deployment, guardrail status ใน app |
| FR-NOTI-003 | Production v1 ต้องรองรับ email notification | P0 | Email ส่งสำหรับ invite, approval request, ticket update, guardrail block, backup/restore, license warning |

### 8.15 Audit, Monitoring, Backup, License

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-AUD-001 | ระบบต้อง audit security-sensitive events | P0 | Login/logout, failed login, role change, AI key change, guardrail, publish, deployment, restore, ticket, PRD change ถูก log |
| FR-AUD-002 | Audit retention ต้อง configurable | P0 | Default 1 year และ Admin ปรับ retention ได้ |
| FR-OBS-001 | Admin Console ต้องมี health dashboard | P0 | แสดง status ของ PostgreSQL, Keycloak, MinIO, Redis, AI Gateway, Caddy, queues, generated app containers |
| FR-OBS-002 | Architecture ต้องรองรับ metrics/logs/traces/alerts | P1 | Export ไป external observability stack ได้ |
| FR-BCK-001 | Backup schedule ต้อง configurable | P0 | Admin ตั้ง schedule, target storage, retention, encryption ได้ |
| FR-BCK-002 | PostgreSQL ต้องรองรับ PITR | P0 | Restore ไปยัง point-in-time ได้ตาม retention policy |
| FR-BCK-003 | ระบบต้องมี restore drill/verification | P0 | Admin run restore validation ได้และได้ report |
| FR-LIC-001 | ระบบต้องมี full license module | P0 | License key/signed file, edition, seats, app limit, AI usage entitlement, expiry, grace period |
| FR-LIC-002 | License ต้องรองรับ online validation และ offline fallback | P0 | Private server ใช้งานต่อได้ตาม grace/offline policy เมื่อ validation endpoint unavailable |
| FR-LIC-003 | License violation ต้องไม่ทำให้ข้อมูลสูญหาย | P0 | ระบบจำกัด create/publish/AI usage ตาม policy แต่ไม่ delete data |

## 9. Non-Functional Requirements

| ID | Category | Requirement | Target |
| --- | --- | --- | --- |
| NFR-PERF-001 | Performance | Platform page load | < 3 seconds สำหรับ normal network |
| NFR-PERF-002 | Performance | Creator workspace initial load | < 5 seconds |
| NFR-PERF-003 | Performance | App Store search | < 1 second สำหรับ typical pilot dataset |
| NFR-PERF-004 | Performance | Ticket submission | < 2 seconds excluding attachment upload |
| NFR-AVL-001 | Availability | Pilot uptime target | 99.0% |
| NFR-AVL-002 | Availability | Production uptime target | 99.5% |
| NFR-SEC-001 | Security | Secrets handling | API keys/secrets encrypted at rest and never sent to unauthorized clients |
| NFR-SEC-002 | Security | Auth boundary | Backend permission guard mandatory; frontend guard is UX only |
| NFR-SEC-003 | Security | AI data protection | Blocked/sensitive prompts must not be sent to unauthorized external provider |
| NFR-OPS-001 | Operability | Installability | Fresh private server install must produce health-checked running system |
| NFR-OPS-002 | Operability | Backup verification | Restore drill must generate pass/fail report |
| NFR-MAINT-001 | Maintainability | Standard stack | Generated app stack v1 must stay standardized for supportability |
| NFR-MAINT-002 | Maintainability | Traceability | Every generated app deployment links PRD version, manifest, code version, DB migration, deployment record |

## 10. User Stories

### IT/System Admin

US-ADM-001: As an IT/System Admin, I want to install the platform on a private server so that my organization can run its own AI application builder.  
US-ADM-002: As an IT/System Admin, I want to configure OIDC/SAML and a break-glass admin account so that users authenticate through enterprise identity while emergency access remains possible.  
US-ADM-003: As an IT/System Admin, I want to approve domain and production publish requests based on policy so that risky deployments do not bypass governance.  
US-ADM-004: As an IT/System Admin, I want backup, restore, upgrade, rollback, health, license, and audit dashboards so that I can operate the platform in production.

### AI Admin / Security Admin

US-AI-001: As an AI Admin, I want to manage provider adapters, models, API keys, quotas, scenario routing, and fallback so that AI usage is controlled centrally.  
US-SEC-001: As a Security Admin, I want guardrails to block unsafe prompts before external AI calls so that sensitive data and security controls are protected.  
US-SEC-002: As a Security Admin, I want audit logs for AI, access, domain, publish, and guardrail events so that incidents can be investigated.

### Creator / Developer / App Owner

US-CRE-001: As a Creator, I want to create a project and generate a PRD draft so that the app has a source of truth before generation.  
US-CRE-002: As a Creator, I want to prompt AI and preview the app live so that I can iterate without local installation.  
US-CRE-003: As a Creator, I want to invite users and assign app roles so that my app can be used by the right people.  
US-DEV-001: As a Developer, I want to edit generated app code under project scope so that edge cases can be handled without bypassing governance.  
US-OWN-001: As an App Owner, I want to approve access and low-risk publish requests so that business apps can move forward without making IT approve everything.

### End User

US-END-001: As an End User, I want to see apps I can access in a PWA app store so that I can find internal tools easily.  
US-END-002: As an End User, I want to request access to available apps so that I can get permission without contacting IT manually.  
US-END-003: As an End User, I want to submit bug/feedback tickets and track status so that app owners can improve the app.  
US-END-004: As an External User, I want to access approved apps through controlled public/external access so that I can collaborate with the organization securely.

## 11. End-to-End Production Flow

1. IT Admin installs platform on private server using CLI installer and Local Web Setup Wizard.
2. Admin configures domain/TLS, storage, PostgreSQL, Keycloak or external IdP, AI providers, guardrail, backup, license, and first admin.
3. Creator creates a project and selects data classification.
4. AI generates PRD draft using approved skills and permission-filtered knowledge.
5. Creator confirms PRD baseline.
6. Creator prompts AI to generate app.
7. System checks guardrail, uses provider adapter routing, logs AI usage, and updates preview.
8. Developer may edit code under governed scope if needed.
9. Creator/App Owner invites users and defines app roles.
10. Creator submits publish request.
11. Policy engine determines reviewers based on classification, domain, public/external access, schema changes, and security risk.
12. Approved app builds and deploys as a separate container with schema per app.
13. End User sees app in App Store based on visibility rules.
14. End User opens app or submits ticket.
15. Creator converts ticket into PRD change request.
16. Approved change updates PRD, app version, deployment traceability, and audit log.

## 12. Traceability Matrix

| Goal | Related Requirements | Validation |
| --- | --- | --- |
| G1 Productivity | FR-CRE-001 to FR-CRE-007, FR-PRD-001 to FR-PRD-005 | Creator can create PRD, prompt, preview, invite, publish request |
| G2 Reduce IT backlog | FR-ACCESS-003, FR-RUN-006, FR-TKT-005 | App Owner approves low-risk work; tickets convert to PRD changes |
| G3 Governance | FR-AUTH, FR-ACCESS, FR-AI, FR-GRD, FR-DATA, FR-AUD | Security/admin policy tests and audit review |
| G4 Production app runtime | FR-RUN-001 to FR-RUN-006, FR-DATA-004 | Generated app deploys as separate container with schema isolation |
| G5 Feedback loop | FR-TKT-001 to FR-TKT-005, FR-PRD-003, FR-PRD-005 | End User ticket becomes PRD change request |
| G6 Operations | FR-INST, FR-BCK, FR-OBS, FR-LIC | Install/upgrade/rollback/backup/restore/license acceptance tests |

## 13. Success Metrics

### Productivity

- Median time from project creation to first working preview
- Median time from PRD baseline to first internal publish
- Number of internal apps published per month
- Reduction in IT internal app backlog over 1 quarter

### Governance and Security

- Percentage of generated apps using Platform Auth and app-level roles
- Percentage of publish events with complete PRD/deployment traceability
- Number of blocked guardrail events reviewed
- Number of unauthorized access attempts blocked and audited

### Operational Reliability

- Install success rate on supported private server environments
- Backup job success rate
- Restore drill success rate
- Upgrade success and rollback success rate
- Platform uptime

### Adoption

- Active Creators per month
- Active End Users per month
- App Store app open rate
- Percentage of invited users who accept and use apps

### Feedback Loop

- Tickets submitted per app
- Percentage of tickets converted to PRD change requests
- Time from ticket submission to approved PRD change
- Percentage of resolved tickets linked to deployment/change record

## 14. Open Questions

| ID | Question | Owner | Blocking? |
| --- | --- | --- | --- |
| OQ-001 | Which external AI providers are mandatory for production v1 besides OpenAI-compatible and Azure OpenAI? | Product / Engineering | No |
| OQ-002 | What exact license enforcement policy applies when seat/app/AI entitlement is exceeded? | Product / Legal | Yes before license implementation |
| OQ-003 | What email provider should production v1 support by default: SMTP only or provider adapters? | Engineering / IT | No |
| OQ-004 | What minimum private server hardware profile is officially supported? | Engineering / Ops | Yes before installer release |
| OQ-005 | What compliance policy templates should be bundled for Public/Internal/Confidential/Restricted? | Security / Product | Yes before policy engine release |
| OQ-006 | Should direct external IdP integration bypass Keycloak or always route through a broker abstraction? | Architecture | Yes before auth implementation |
| OQ-007 | What code editor capability is allowed for Developer role: browser editor only, repo branch workflow, or both? | Product / Engineering / Security | No |

## 15. Validation Checklist

- [ ] Requirements distinguish Production v1, P1, and future considerations.
- [ ] Every P0 requirement has observable acceptance criteria.
- [ ] Creator cannot access Admin-only AI key, SSO, backup, infrastructure, or guardrail config.
- [ ] Generated apps cannot bypass Platform Auth or Permission Guard.
- [ ] Publish policy accounts for data classification, public/external access, domain, schema migration, and security risk.
- [ ] Audit events cover authentication, access, AI, guardrail, PRD, ticket, deployment, restore, backup, license, and domain changes.
- [ ] Backup and restore are testable, not only configurable.
- [ ] App Store visibility is permission-based.
- [ ] Ticket-to-PRD flow is traceable.
- [ ] Non-goals explicitly exclude multi-tenant SaaS, Local LLM requirement, Kubernetes v1, SLA, and multi-stack v1.

## 16. Recommended Next Artifacts

1. Architecture Decision Record set:
   - ADR-001 Single Enterprise Private Server Deployment
   - ADR-002 AI Provider Adapter Architecture
   - ADR-003 Generated App Container and Schema Isolation
   - ADR-004 Policy-Based Publish Governance
2. Requirements Traceability Matrix with test case IDs.
3. Domain model and data dictionary.
4. Security model and permission matrix.
5. Production rollout phase plan.
6. Implementation backlog split by surface and platform service.
