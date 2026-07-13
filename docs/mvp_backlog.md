Enterprise Vibe Coding Platform
MVP Backlog, Wireframe, Database Schema, API Spec & AI-Optimized Sprint Plan
Version: 0.1
Based on: PRD v0.3
Target: MVP / Prototype-to-Pilot
Primary Goal: สร้างระบบต้นแบบที่ใช้งานได้จริงสำหรับ 3 surfaces ได้แก่ IT/System Admin, Creator App และ End User App Store PWA

1. MVP Development Strategy
1.1 แนวคิดการพัฒนา
MVP นี้ควรพัฒนาแบบ vertical slice ไม่ใช่ทำระบบทั้งหมดทีละ layer เพราะต้องพิสูจน์ว่า flow หลักทำงานครบตั้งแต่:
Admin ติดตั้ง/ตั้งค่า
↓
Creator สร้าง Project
↓
AI สร้าง PRD + App
↓
Creator Preview / Invite / Publish
↓
End User เข้า App Store
↓
End User ส่ง Ticket
↓
Creator แปลง Ticket เป็น PRD Change

1.2 MVP Success Flow
MVP ต้อง demo ได้อย่างน้อย 1 use case end-to-end:
1. Admin login
2. Admin ตั้งค่า AI provider/mock key
3. Creator สร้าง Leave Request App
4. AI สร้าง PRD draft
5. Creator confirm PRD
6. AI generate mock app preview
7. Creator invite user
8. Creator publish ไป App Store
9. End User เห็น App ใน PWA
10. End User ส่ง Bug/Feedback ticket
11. Creator เห็น ticket และ convert เป็น PRD change request

1.3 AI Development Principle
เพื่อให้ใช้ AI ช่วยพัฒนาได้ดีที่สุด ควรทำงานแบบ:
Spec-first
Template-first
Small-task-first
Testable-output-first
Human-review-gated

ทุก task ควรมี:
- Objective
- Input
- Output
- Files affected
- Acceptance criteria
- Test scenario
- AI prompt instruction


2. MVP Backlog
Epic 0: Project Foundation
E0.1 Repository & Monorepo Setup
Priority: P0
Goal: สร้าง repository โครงสร้างหลัก
Scope:
/apps/admin-web
/apps/creator-web
/apps/app-store-pwa
/apps/platform-api
/packages/ui
/packages/auth-sdk
/packages/types
/packages/config
/packages/api-client
/docker
/docs

Acceptance Criteria:
- Run dev ได้ครบ frontend/backend
- Shared types ใช้ร่วมกันได้
- Shared UI package import ได้
- Docker Compose start service หลักได้


E0.2 Standard UI Design System
Priority: P0
Goal: สร้าง UI component กลาง
Components:
Button
Input
Select
Card
Table
Badge
Tabs
Modal
Drawer
Toast
Sidebar
Topbar
StatusPill
MetricCard
EmptyState
Timeline

Acceptance Criteria:
- Admin / Creator / App Store ใช้ component ชุดเดียวกัน
- มี theme token เช่น primary, success, warning, danger
- Responsive-ready


E0.3 Authentication Skeleton
Priority: P0
Goal: เตรียม auth mock/real-ready
Scope:
- Login page
- Auth context
- Role-based route guard
- Mock current user
- Token placeholder

Acceptance Criteria:
- User login/logout ได้
- Route guard ทำงาน
- Role: admin / creator / end_user แยกหน้าได้


Epic 1: IT/System Admin Software
E1.1 Admin Dashboard
Priority: P0
Goal: หน้า overview สำหรับ System Admin
Features:
- Service health summary
- Active projects
- Published apps
- AI usage summary
- Guardrail events
- Open system alerts

Acceptance Criteria:
- Admin เห็น system status ได้
- แสดง mock/real service health ได้


E1.2 AI Provider & API Key Management
Priority: P0
Goal: Admin จัดการ AI provider, model, API key, scenario, quota, fallback
Features:
- Add provider
- Add multiple API keys
- Set usage mode
- Set scenario routing
- Set quota
- Set fallback priority
- View usage logs

Fields:
Provider name
Base URL
Model name
API key encrypted
Usage mode
Allowed scenarios
Daily token limit
Monthly token limit
Fallback order
Status

Acceptance Criteria:
- เพิ่ม API key ได้หลาย key
- กำหนด scenario ต่อ key ได้
- กำหนด fallback ได้
- Creator มองไม่เห็น API key


E1.3 Guardrail Policy Engine
Priority: P0
Goal: ตั้งค่า banned keyword และ AI policy
Features:
- Banned keyword rule
- Regex rule
- AI policy rule
- Severity
- Action: allow / warn / block / require approval
- Test prompt
- Triggered events

Acceptance Criteria:
- Prompt ที่มี keyword ต้อง trigger rule
- Prompt ที่ตรง policy ต้อง warn/block ได้
- เก็บ event log ได้


E1.4 SSO / Auth Settings
Priority: P1
Goal: ตั้งค่า auth mode และ SSO
Features:
- Local auth
- OIDC config
- SAML config placeholder
- LDAP placeholder
- Group mapping UI

Acceptance Criteria:
- Admin เห็น auth provider ได้
- กำหนด group mapping ได้
- Mock SSO login flow ได้


E1.5 Domain Management
Priority: P1
Goal: ตั้งค่า domain และ routing policy
Features:
- Platform domain
- Creator domain
- App Store domain
- Generated app base route
- Public domain approval policy

Acceptance Criteria:
- Admin เห็น route ทั้งหมด
- App domain request ถูก approve/reject ได้


Epic 2: Creator App
E2.1 Creator Home / Project Picker
Priority: P0
Goal: Creator เลือก project หรือสร้างใหม่
Features:
- My Projects
- Shared with Me
- Draft Apps
- Published Apps
- Remixed Projects
- Archived Projects
- Create New Project
- Remix Project

Acceptance Criteria:
- Creator เห็นเฉพาะ project ของตน
- เปิด project workspace ได้
- Remix project ได้แบบ mock


E2.2 Create Project + PRD Draft
Priority: P0
Goal: Creator สร้าง project และ AI generate PRD
Features:
- App name
- Business problem
- App type
- Intended users
- Data sensitivity
- AI-generated PRD draft
- Confirm PRD baseline

Acceptance Criteria:
- สร้าง project ได้
- AI/mock AI สร้าง PRD draft ได้
- Confirm แล้วสร้าง PRD v1.0 ได้


E2.3 Prompt Builder + Live Preview
Priority: P0
Goal: Workspace แบบ Lovable
Features:
- Chat prompt
- AI task progress
- Live preview panel
- Device preview
- Preview refresh
- Token remaining
- Right panel tabs

Acceptance Criteria:
- Creator ส่ง prompt ได้
- AI response สร้าง task progress ได้
- Preview update ได้แบบ mock/generated
- Token remaining ลดลงหลัง prompt


E2.4 Project PRD Lifecycle
Priority: P0
Goal: PRD เป็น source of truth ของ project
Features:
- View PRD
- Edit PRD with AI
- PRD version history
- PRD change request
- Compare versions
- Export Markdown/PDF placeholder

Acceptance Criteria:
- ทุก project มี PRD
- PRD มี version
- Prompt ที่เปลี่ยน requirement สร้าง PRD change request ได้


E2.5 Database Table View
Priority: P0
Goal: Creator ดู schema/table ได้
Features:
- Schema view
- Table view
- Relationship view
- Sample records
- Migration history

Acceptance Criteria:
- Creator เห็น table ของ app ตัวเอง
- ดู field/record ได้
- ไม่มี raw SQL ใน MVP


E2.6 Frontend Version Restore
Priority: P0
Goal: Restore เฉพาะ frontend
Features:
- Frontend checkpoint timeline
- Preview old version
- Compare current vs selected version
- Restore frontend only

Acceptance Criteria:
- Restore แล้วกระทบเฉพาะ frontend files
- Backend/database/auth/role ไม่เปลี่ยน
- สร้าง checkpoint ใหม่หลัง restore


E2.7 Remix Project
Priority: P1
Goal: Creator สร้าง project ใหม่จาก project/template เดิม
Features:
- Remix frontend only
- Remix full app
- Copy PRD
- Copy schema
- Remove production data
- Reset members
- Reset domain

Acceptance Criteria:
- Remix project ได้
- Project ใหม่มี owner ใหม่
- Production data ไม่ถูก copy


E2.8 App User Management
Priority: P0
Goal: Creator invite user และ assign role ใน app
Features:
- Invite internal user
- Invite external user
- Invite group
- Assign app role
- View app members
- Pending invites
- Access requests

Acceptance Criteria:
- Invite user ได้
- User ได้ app membership หลัง accept
- Role เป็นระดับ app ไม่ใช่ platform


E2.9 Creator Ticket Inbox
Priority: P1
Goal: Creator ดู feedback/bug จาก End User
Features:
- Ticket list
- Ticket detail
- Status update
- Reply
- Convert to PRD change request
- Convert to AI prompt

Acceptance Criteria:
- Creator เห็น ticket ของ app ที่ตัวเองดูแล
- Convert ticket เป็น PRD change request ได้


Epic 3: End User App Store PWA
E3.1 PWA App Store Home
Priority: P0
Goal: End User เห็น app ที่เข้าถึงได้
Features:
- My Apps
- Available Apps
- Favorites
- Recently Used
- Search
- Filter

Acceptance Criteria:
- แสดง app ตาม access permission
- Responsive mobile-first
- มี PWA manifest


E3.2 App Detail
Priority: P0
Goal: ดูรายละเอียด app และเปิดใช้งาน
Features:
- App name
- Description
- Owner/Creator
- My role
- Health
- Open app
- Request access
- Submit ticket

Acceptance Criteria:
- User เปิด app ที่มีสิทธิ์ได้
- User ขอสิทธิ์ app ที่ยังไม่มีสิทธิ์ได้


E3.3 Request Access
Priority: P0
Goal: End User ขอ access app
Features:
- Request reason
- Requested role optional
- Status tracking
- Creator approval

Acceptance Criteria:
- User ส่ง request ได้
- Creator เห็น request
- Approve แล้ว user เข้า app ได้


E3.4 Support Ticket
Priority: P0
Goal: End User แจ้ง bug/feedback/feature request
Features:
- Ticket type
- Title
- Description
- Priority
- Screenshot optional
- Device/browser info
- Ticket status

Acceptance Criteria:
- Submit ticket ได้
- Ticket route ไป Creator/App Owner
- User track status ได้


Epic 4: Generated App Runtime
E4.1 App Manifest
Priority: P0
Goal: ทุก app มี manifest เพื่อควบคุม auth, role, domain, PRD, frontend version
Fields:
appId
name
owner
creator
accessMode
roles
permissions
auth
domain
prd
frontend
deployment

Acceptance Criteria:
- สร้าง manifest ตอน create project
- Update manifest ตอน publish
- App Store ใช้ manifest แสดง app


E4.2 Mock App Generator
Priority: P0
Goal: สร้าง preview app แบบ mock/generator สำหรับ MVP
Features:
- Generate UI from template
- Generate sample schema
- Generate app pages
- Generate mock API

Acceptance Criteria:
- Creator สร้าง CRUD/Workflow app preview ได้
- Preview เปลี่ยนตาม prompt ได้แบบ basic


E4.3 Publish to App Store
Priority: P0
Goal: Creator publish app ไป End User App Store
Features:
- Publish version
- Update app registry
- Set access mode
- Generate internal URL
- Link PRD version

Acceptance Criteria:
- Published app ปรากฏใน App Store
- End User เห็นตาม permission


Epic 5: Monitoring & Audit
E5.1 Audit Log
Priority: P0
Events:
Login/logout
Project created
Prompt sent
PRD created/updated
App published
Invite sent
Access approved
Ticket submitted
Frontend restored
Guardrail triggered
AI key changed

Acceptance Criteria:
- Event สำคัญถูก log
- Admin filter audit ได้


E5.2 Usage Monitoring
Priority: P1
Metrics:
Token usage by user
Token usage by project
Token usage by scenario
Open tickets
Published apps
Active users

Acceptance Criteria:
- Admin เห็น usage รวม
- Creator เห็น usage ของตัวเอง


3. Wireframe
3.1 Surface Map
┌──────────────────────────────────────────────┐
│                  Platform                    │
├────────────────────┬─────────────────────────┤
│ Admin Console      │ /admin                  │
│ Creator App        │ /creator                │
│ End User App Store │ /store                  │
│ Generated Apps     │ /apps/{appSlug}         │
└────────────────────┴─────────────────────────┘


3.2 Admin Console Wireframe
Admin Dashboard
┌─────────────────────────────────────────────────────────────┐
│ Admin Console                                    Admin User │
├───────────────┬─────────────────────────────────────────────┤
│ Sidebar       │ System Overview                             │
│               │                                             │
│ Dashboard     │ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ Services      │ │Health   │ │Apps     │ │AI Usage │        │
│ AI Keys       │ └─────────┘ └─────────┘ └─────────┘        │
│ Guardrails    │                                             │
│ Auth / SSO    │ Service Status                              │
│ Domains       │ ┌─────────────────────────────────────────┐ │
│ Knowledge     │ │ PostgreSQL  Healthy                     │ │
│ Skills        │ │ Keycloak    Healthy                     │ │
│ Deployments   │ │ AI Gateway  Warning                     │ │
│ Audit Logs    │ └─────────────────────────────────────────┘ │
└───────────────┴─────────────────────────────────────────────┘


AI API Key Management
┌─────────────────────────────────────────────────────────────┐
│ AI Providers & API Keys                         [+ Add Key] │
├─────────────────────────────────────────────────────────────┤
│ Tabs: Providers | Models | API Keys | Routing | Quota | Log │
├─────────────────────────────────────────────────────────────┤
│ API Keys Table                                               │
│ ┌──────┬──────────┬────────────┬────────────┬─────────────┐ │
│ │Name  │Provider  │Usage Mode  │Quota       │Fallback     │ │
│ ├──────┼──────────┼────────────┼────────────┼─────────────┤ │
│ │Key A │OpenAI    │Planning    │100k/day    │Primary      │ │
│ │Key B │OpenAI    │Coding      │500k/day    │Fallback 1   │ │
│ │Key C │Local     │Sensitive   │Unlimited   │Primary      │ │
│ └──────┴──────────┴────────────┴────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘


Guardrail Page
┌─────────────────────────────────────────────────────────────┐
│ Guardrail Policy Engine                         [+ Add Rule]│
├─────────────────────────────────────────────────────────────┤
│ Tabs: Banned Keywords | AI Policies | Test Prompt | Events  │
├─────────────────────────────────────────────────────────────┤
│ AI Policies                                                 │
│ ┌──────────────┬─────────┬────────────┬──────────┐         │
│ │Policy        │Severity │Action      │Status    │         │
│ ├──────────────┼─────────┼────────────┼──────────┤         │
│ │Bypass Auth   │Critical │Block       │Active    │         │
│ │Dump Database │Critical │Block       │Active    │         │
│ │Public Data   │High     │Approval    │Active    │         │
│ └──────────────┴─────────┴────────────┴──────────┘         │
│                                                             │
│ Test Prompt                                                 │
│ [________________________________________] [Test]           │
└─────────────────────────────────────────────────────────────┘


3.3 Creator App Wireframe
Creator Home / Project Picker
┌─────────────────────────────────────────────────────────────┐
│ Creator App                         Tokens: 82,430 left     │
├─────────────────────────────────────────────────────────────┤
│ [Create New Project] [Remix Project] [Templates]            │
├─────────────────────────────────────────────────────────────┤
│ Filters: My Projects | Shared | Draft | Published | Archive │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐            │
│ │ Leave Management    │ │ Asset Request       │            │
│ │ PRD v1.2            │ │ PRD v0.8 Draft      │            │
│ │ Frontend v14        │ │ Frontend v3         │            │
│ │ Published           │ │ Draft               │            │
│ │ [Open] [Remix]      │ │ [Open] [Remix]      │            │
│ └─────────────────────┘ └─────────────────────┘            │
└─────────────────────────────────────────────────────────────┘


Prompt Builder / Live Preview Workspace
┌────────────────────────────────────────────────────────────────────────┐
│ Leave Management | PRD v1.2 | Frontend v14 | Tokens 82,430 | Publish  │
├──────────────────────┬─────────────────────────────┬──────────────────┤
│ Chat / Prompt         │ Live Preview                │ Right Panel      │
│                      │                             │ Tabs:            │
│ AI: What do you      │ ┌─────────────────────────┐ │ PRD              │
│ want to change?      │ │ Leave Dashboard         │ │ Database         │
│                      │ │                         │ │ Versions         │
│ User: Add WFH leave  │ │ [New Request]           │ │ Users            │
│ type                 │ │ [Pending Approval]      │ │ Tickets          │
│                      │ │                         │ │ Logs             │
│ AI Progress          │ └─────────────────────────┘ │ API              │
│ ✓ Load PRD           │                             │                  │
│ ✓ Update schema      │ Device: Desktop Tablet Mob │                  │
│ ✓ Update UI          │ [Refresh] [Open Preview]   │                  │
│ □ Build preview      │                             │                  │
├──────────────────────┴─────────────────────────────┴──────────────────┤
│ Prompt: [____________________________________________________] [Send] │
└────────────────────────────────────────────────────────────────────────┘


Database View
┌─────────────────────────────────────────────────────────────┐
│ Database View: Leave Management                             │
├─────────────────────────────────────────────────────────────┤
│ Tabs: Schema | Table View | Relationships | Migrations      │
├───────────────┬─────────────────────────────────────────────┤
│ Tables        │ leave_requests                              │
│ - users ref   │ ┌────────────┬─────────────┬─────────────┐ │
│ - leave_req   │ │Column      │Type         │Required     │ │
│ - leave_type  │ ├────────────┼─────────────┼─────────────┤ │
│ - approvals   │ │id          │uuid         │yes          │ │
│               │ │requesterId │platformUser │yes          │ │
│               │ │leaveType   │string       │yes          │ │
│               │ │status      │enum         │yes          │ │
│               │ └────────────┴─────────────┴─────────────┘ │
│               │                                             │
│               │ Sample Records                              │
│               │ [Search...]                                 │
└───────────────┴─────────────────────────────────────────────┘


Frontend Version Restore
┌─────────────────────────────────────────────────────────────┐
│ Frontend Versions                                           │
├─────────────────────┬───────────────────────────────────────┤
│ Version Timeline    │ Preview Selected Version              │
│                     │                                       │
│ ● v14 Current       │ ┌───────────────────────────────────┐ │
│ ● v13 Before WFH    │ │ Old Leave Dashboard Preview       │ │
│ ● v12 Published     │ └───────────────────────────────────┘ │
│ ● v11 UI Cleanup    │                                       │
│                     │ Changes                              │
│                     │ - Header layout changed              │
│                     │ - New Leave Type dropdown            │
│                     │                                       │
│                     │ [Compare] [Restore Frontend Only]    │
└─────────────────────┴───────────────────────────────────────┘


App User Management
┌─────────────────────────────────────────────────────────────┐
│ App Users: Leave Management                    [+ Invite]   │
├─────────────────────────────────────────────────────────────┤
│ Tabs: Members | Pending Invites | Access Requests | Roles   │
├─────────────────────────────────────────────────────────────┤
│ Members                                                     │
│ ┌──────────────┬──────────────┬──────────────┬───────────┐ │
│ │User          │Type          │App Role      │Status     │ │
│ ├──────────────┼──────────────┼──────────────┼───────────┤ │
│ │Ann HR        │Internal      │HR Admin      │Active     │ │
│ │Somchai       │Internal      │Manager       │Active     │ │
│ │vendor@x.com  │External      │Viewer        │Pending    │ │
│ └──────────────┴──────────────┴──────────────┴───────────┘ │
└─────────────────────────────────────────────────────────────┘


Creator Ticket Inbox
┌─────────────────────────────────────────────────────────────┐
│ Support Tickets: Leave Management                           │
├─────────────────────────────────────────────────────────────┤
│ Filters: Open | In Review | Planned | Resolved              │
├──────────────────────┬──────────────────────────────────────┤
│ Ticket List           │ Ticket Detail                       │
│                      │                                      │
│ #102 Bug             │ Title: WFH leave not showing         │
│ #101 Feature Request │ Submitted by: Ann HR                 │
│ #100 Feedback        │ Status: Open                         │
│                      │                                      │
│                      │ Description...                       │
│                      │                                      │
│                      │ [Reply] [Convert to PRD Change]      │
│                      │ [Convert to AI Prompt] [Resolve]     │
└──────────────────────┴──────────────────────────────────────┘


3.4 End User App Store PWA Wireframe
Mobile Home
┌────────────────────────────┐
│ App Store        Profile   │
├────────────────────────────┤
│ Search apps...             │
├────────────────────────────┤
│ My Apps                    │
│ ┌────────────────────────┐ │
│ │ Leave Management       │ │
│ │ Role: Employee         │ │
│ │ [Open] [Ticket]        │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ Meeting Room           │ │
│ │ Role: User             │ │
│ │ [Open] [Ticket]        │ │
│ └────────────────────────┘ │
├────────────────────────────┤
│ Available Apps             │
│ ┌────────────────────────┐ │
│ │ Asset Request          │ │
│ │ [Request Access]       │ │
│ └────────────────────────┘ │
└────────────────────────────┘


App Detail
┌────────────────────────────┐
│ Leave Management           │
├────────────────────────────┤
│ Owner: HR Department       │
│ Creator: Ann HR            │
│ My Role: Employee          │
│ Status: Healthy            │
│ Version: 1.2               │
├────────────────────────────┤
│ [Open App]                 │
│ [Report Bug]               │
│ [Send Feedback]            │
│ [Request Role Change]      │
├────────────────────────────┤
│ Release Notes              │
│ - Added WFH leave type     │
└────────────────────────────┘


Submit Ticket
┌────────────────────────────┐
│ Submit Ticket              │
├────────────────────────────┤
│ App: Leave Management      │
│ Type: [Bug Report v]       │
│ Priority: [Medium v]       │
│ Title: [______________]    │
│ Description:               │
│ [______________________]   │
│ [______________________]   │
│ Screenshot: [Upload]       │
│                            │
│ [Submit Ticket]            │
└────────────────────────────┘


4. Database Schema
4.1 Core Entity Relationship Overview
platform_users
  ├── project_members
  ├── app_members
  ├── app_invitations
  ├── support_tickets
  └── audit_logs

projects
  ├── project_prds
  ├── frontend_checkpoints
  ├── project_versions
  ├── apps
  └── support_tickets

apps
  ├── app_roles
  ├── app_permissions
  ├── app_members
  ├── app_invitations
  ├── app_domains
  └── deployments


4.2 Auth & User Tables
platform_users (
  id uuid primary key,
  external_id varchar,
  email varchar unique not null,
  display_name varchar not null,
  avatar_url text,
  user_type varchar not null, -- internal, external
  department varchar,
  position varchar,
  status varchar not null, -- active, inactive, invited
  last_login_at timestamp,
  created_at timestamp,
  updated_at timestamp
)

platform_groups (
  id uuid primary key,
  name varchar not null,
  source varchar not null, -- local, sso, ad, ldap
  external_id varchar,
  description text,
  created_at timestamp,
  updated_at timestamp
)

platform_roles (
  id uuid primary key,
  name varchar unique not null,
  description text,
  created_at timestamp
)

platform_user_groups (
  user_id uuid references platform_users(id),
  group_id uuid references platform_groups(id),
  primary key (user_id, group_id)
)

platform_user_roles (
  user_id uuid references platform_users(id),
  role_id uuid references platform_roles(id),
  primary key (user_id, role_id)
)


4.3 Project Tables
projects (
  id uuid primary key,
  name varchar not null,
  slug varchar unique not null,
  description text,
  owner_user_id uuid references platform_users(id),
  app_type varchar, -- crud, workflow, dashboard, form, portal, report
  status varchar, -- draft, active, published, archived
  current_prd_version_id uuid,
  current_frontend_checkpoint_id uuid,
  token_used_month bigint default 0,
  created_at timestamp,
  updated_at timestamp
)

project_members (
  id uuid primary key,
  project_id uuid references projects(id),
  user_id uuid references platform_users(id),
  role varchar not null, -- owner, editor, reviewer, viewer
  created_at timestamp
)

project_versions (
  id uuid primary key,
  project_id uuid references projects(id),
  version_label varchar,
  git_commit varchar,
  description text,
  created_by uuid references platform_users(id),
  created_at timestamp
)

project_remixes (
  id uuid primary key,
  source_project_id uuid references projects(id),
  new_project_id uuid references projects(id),
  remix_type varchar, -- frontend_only, full_app, template
  options jsonb,
  created_by uuid references platform_users(id),
  created_at timestamp
)


4.4 PRD Tables
project_prds (
  id uuid primary key,
  project_id uuid references projects(id),
  current_version_id uuid,
  status varchar, -- draft, baseline, active, archived
  created_by uuid references platform_users(id),
  created_at timestamp,
  updated_at timestamp
)

project_prd_versions (
  id uuid primary key,
  prd_id uuid references project_prds(id),
  version_number varchar not null,
  content_markdown text not null,
  content_json jsonb,
  change_summary text,
  version_type varchar, -- draft, baseline, minor, major
  approval_status varchar, -- none, pending, approved, rejected
  created_by uuid references platform_users(id),
  created_at timestamp
)

project_prd_change_requests (
  id uuid primary key,
  project_id uuid references projects(id),
  prd_id uuid references project_prds(id),
  title varchar not null,
  description text,
  source_type varchar, -- prompt, ticket, manual
  source_id uuid,
  affected_sections jsonb,
  risk_level varchar, -- low, medium, high, critical
  status varchar, -- draft, pending, approved, rejected, implemented
  created_by uuid references platform_users(id),
  created_at timestamp,
  updated_at timestamp
)

project_prd_approvals (
  id uuid primary key,
  change_request_id uuid references project_prd_change_requests(id),
  approver_user_id uuid references platform_users(id),
  status varchar, -- pending, approved, rejected
  comment text,
  decided_at timestamp
)


4.5 App Tables
apps (
  id uuid primary key,
  project_id uuid references projects(id),
  name varchar not null,
  slug varchar unique not null,
  description text,
  owner_user_id uuid references platform_users(id),
  creator_user_id uuid references platform_users(id),
  access_mode varchar, -- private, organization, group_restricted, public, external_shared
  status varchar, -- draft, published, disabled, archived
  manifest jsonb not null,
  current_deployment_id uuid,
  created_at timestamp,
  updated_at timestamp
)

app_roles (
  id uuid primary key,
  app_id uuid references apps(id),
  name varchar not null,
  description text,
  is_default boolean default false,
  created_at timestamp
)

app_permissions (
  id uuid primary key,
  app_id uuid references apps(id),
  key varchar not null, -- leave.request.create
  description text,
  created_at timestamp
)

app_role_permissions (
  role_id uuid references app_roles(id),
  permission_id uuid references app_permissions(id),
  primary key (role_id, permission_id)
)

app_members (
  id uuid primary key,
  app_id uuid references apps(id),
  user_id uuid references platform_users(id),
  role_id uuid references app_roles(id),
  status varchar, -- active, suspended, expired
  invited_by uuid references platform_users(id),
  joined_at timestamp,
  expires_at timestamp,
  created_at timestamp
)

app_invitations (
  id uuid primary key,
  app_id uuid references apps(id),
  email varchar,
  invited_user_id uuid references platform_users(id),
  role_id uuid references app_roles(id),
  invite_type varchar, -- internal, external, group
  status varchar, -- pending, accepted, expired, revoked
  token_hash varchar,
  invited_by uuid references platform_users(id),
  expires_at timestamp,
  accepted_at timestamp,
  created_at timestamp
)

app_access_requests (
  id uuid primary key,
  app_id uuid references apps(id),
  requester_user_id uuid references platform_users(id),
  requested_role_id uuid references app_roles(id),
  reason text,
  status varchar, -- pending, approved, rejected
  decided_by uuid references platform_users(id),
  decided_at timestamp,
  created_at timestamp
)


4.6 Frontend Version Tables
frontend_checkpoints (
  id uuid primary key,
  project_id uuid references projects(id),
  checkpoint_label varchar,
  description text,
  file_snapshot_ref text,
  git_commit varchar,
  preview_image_url text,
  created_by uuid references platform_users(id),
  created_at timestamp
)

frontend_restore_logs (
  id uuid primary key,
  project_id uuid references projects(id),
  restored_from_checkpoint_id uuid references frontend_checkpoints(id),
  new_checkpoint_id uuid references frontend_checkpoints(id),
  restored_by uuid references platform_users(id),
  note text,
  created_at timestamp
)


4.7 AI Management Tables
ai_providers (
  id uuid primary key,
  name varchar not null,
  provider_type varchar, -- openai_compatible, azure_openai, local, custom
  base_url text,
  status varchar,
  created_at timestamp,
  updated_at timestamp
)

ai_models (
  id uuid primary key,
  provider_id uuid references ai_providers(id),
  model_name varchar not null,
  display_name varchar,
  context_window int,
  max_output_tokens int,
  supports_vision boolean default false,
  status varchar,
  created_at timestamp
)

ai_api_keys (
  id uuid primary key,
  provider_id uuid references ai_providers(id),
  name varchar not null,
  encrypted_key text not null,
  usage_mode varchar,
  environment varchar,
  status varchar,
  priority int default 100,
  daily_token_limit bigint,
  monthly_token_limit bigint,
  daily_cost_limit numeric,
  monthly_cost_limit numeric,
  rate_limit_per_min int,
  created_by uuid references platform_users(id),
  last_used_at timestamp,
  created_at timestamp,
  updated_at timestamp
)

ai_scenario_routes (
  id uuid primary key,
  scenario varchar not null,
  primary_model_id uuid references ai_models(id),
  primary_key_id uuid references ai_api_keys(id),
  fallback_rules jsonb,
  fail_policy varchar, -- fail_closed, fail_open
  created_at timestamp,
  updated_at timestamp
)

ai_usage_logs (
  id uuid primary key,
  user_id uuid references platform_users(id),
  project_id uuid references projects(id),
  scenario varchar,
  provider_id uuid references ai_providers(id),
  model_id uuid references ai_models(id),
  api_key_id uuid references ai_api_keys(id),
  input_tokens int,
  output_tokens int,
  total_tokens int,
  estimated_cost numeric,
  latency_ms int,
  status varchar,
  created_at timestamp
)

ai_quota_policies (
  id uuid primary key,
  scope_type varchar, -- user, group, project, scenario, api_key
  scope_id uuid,
  daily_token_limit bigint,
  monthly_token_limit bigint,
  daily_cost_limit numeric,
  monthly_cost_limit numeric,
  status varchar,
  created_at timestamp,
  updated_at timestamp
)


4.8 Guardrail Tables
guardrail_rules (
  id uuid primary key,
  name varchar not null,
  rule_type varchar, -- keyword, regex, pii, secret
  pattern text not null,
  severity varchar,
  action varchar, -- allow, notify, warn, block, approval
  scope_type varchar,
  scope_id uuid,
  status varchar,
  created_by uuid references platform_users(id),
  created_at timestamp,
  updated_at timestamp
)

guardrail_ai_policies (
  id uuid primary key,
  name varchar not null,
  description text,
  allowed_behavior text,
  disallowed_behavior text,
  examples jsonb,
  classifier_model_id uuid references ai_models(id),
  confidence_threshold numeric,
  severity varchar,
  action varchar,
  scope_type varchar,
  scope_id uuid,
  status varchar,
  created_by uuid references platform_users(id),
  created_at timestamp,
  updated_at timestamp
)

guardrail_events (
  id uuid primary key,
  user_id uuid references platform_users(id),
  project_id uuid references projects(id),
  prompt_excerpt text,
  rule_id uuid,
  policy_id uuid,
  severity varchar,
  action_taken varchar,
  decision varchar,
  metadata jsonb,
  created_at timestamp
)


4.9 Knowledge & Skill Tables
knowledge_items (
  id uuid primary key,
  title varchar not null,
  description text,
  category varchar,
  scope_type varchar, -- global, department, project, app, agent
  scope_id uuid,
  source_type varchar, -- pdf, markdown, text, word, excel, openapi
  source_ref text,
  owner_user_id uuid references platform_users(id),
  status varchar, -- draft, active, deprecated, archived
  tags jsonb,
  created_at timestamp,
  updated_at timestamp
)

knowledge_versions (
  id uuid primary key,
  knowledge_item_id uuid references knowledge_items(id),
  version_number varchar,
  content_text text,
  content_metadata jsonb,
  created_by uuid references platform_users(id),
  created_at timestamp
)

knowledge_chunks (
  id uuid primary key,
  knowledge_version_id uuid references knowledge_versions(id),
  chunk_index int,
  content text,
  embedding_ref text,
  metadata jsonb,
  created_at timestamp
)

agent_skills (
  id uuid primary key,
  name varchar not null,
  description text,
  skill_type varchar,
  scope_type varchar,
  scope_id uuid,
  status varchar,
  created_by uuid references platform_users(id),
  created_at timestamp,
  updated_at timestamp
)

agent_skill_versions (
  id uuid primary key,
  skill_id uuid references agent_skills(id),
  version_number varchar,
  instruction text,
  input_schema jsonb,
  output_schema jsonb,
  required_knowledge jsonb,
  allowed_tools jsonb,
  created_by uuid references platform_users(id),
  created_at timestamp
)

agent_skill_assignments (
  id uuid primary key,
  skill_id uuid references agent_skills(id),
  agent_role varchar,
  scenario varchar,
  status varchar,
  created_at timestamp
)


4.10 Support Ticket Tables
support_tickets (
  id uuid primary key,
  app_id uuid references apps(id),
  project_id uuid references projects(id),
  submitted_by uuid references platform_users(id),
  assigned_to uuid references platform_users(id),
  ticket_type varchar, -- bug, feedback, feature_request, access_issue, data_issue
  title varchar not null,
  description text,
  priority varchar, -- low, medium, high, critical
  status varchar, -- open, in_review, planned, in_progress, resolved, closed, rejected
  device_info jsonb,
  related_prd_change_request_id uuid references project_prd_change_requests(id),
  created_at timestamp,
  updated_at timestamp
)

support_ticket_comments (
  id uuid primary key,
  ticket_id uuid references support_tickets(id),
  author_user_id uuid references platform_users(id),
  comment text not null,
  created_at timestamp
)

support_ticket_attachments (
  id uuid primary key,
  ticket_id uuid references support_tickets(id),
  file_url text not null,
  file_type varchar,
  uploaded_by uuid references platform_users(id),
  created_at timestamp
)

support_ticket_status_logs (
  id uuid primary key,
  ticket_id uuid references support_tickets(id),
  from_status varchar,
  to_status varchar,
  changed_by uuid references platform_users(id),
  created_at timestamp
)


4.11 Domain & Deployment Tables
app_domains (
  id uuid primary key,
  app_id uuid references apps(id),
  domain_type varchar, -- internal_path, internal_subdomain, public_custom
  url text not null,
  status varchar, -- pending, active, disabled, failed
  ssl_status varchar,
  dns_status varchar,
  created_at timestamp,
  updated_at timestamp
)

domain_requests (
  id uuid primary key,
  app_id uuid references apps(id),
  requested_by uuid references platform_users(id),
  requested_domain text,
  domain_type varchar,
  reason text,
  status varchar, -- pending, approved, rejected
  reviewed_by uuid references platform_users(id),
  reviewed_at timestamp,
  created_at timestamp
)

deployments (
  id uuid primary key,
  app_id uuid references apps(id),
  project_id uuid references projects(id),
  environment varchar, -- development, production
  version_label varchar,
  prd_version_id uuid references project_prd_versions(id),
  frontend_checkpoint_id uuid references frontend_checkpoints(id),
  git_commit varchar,
  docker_image_tag varchar,
  migration_version varchar,
  status varchar, -- pending, running, success, failed, rolled_back
  deployed_by uuid references platform_users(id),
  deployed_at timestamp,
  created_at timestamp
)

deployment_logs (
  id uuid primary key,
  deployment_id uuid references deployments(id),
  log_level varchar,
  message text,
  created_at timestamp
)


5. API Spec
5.1 API Design Standard
Base URL:
/api/v1

Response format:
{
  "success": true,
  "data": {},
  "message": "OK",
  "meta": {}
}

Error format:
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "You do not have permission"
  }
}


5.2 Auth API
GET /auth/me
POST /auth/logout
GET /auth/session

GET /auth/me
Returns current user profile and permissions.
Response:
{
  "id": "uuid",
  "email": "creator@company.com",
  "displayName": "Creator User",
  "roles": ["creator"],
  "permissions": ["project.create", "app.invite"]
}


5.3 Admin APIs
AI Provider
GET    /admin/ai/providers
POST   /admin/ai/providers
GET    /admin/ai/providers/{providerId}
PATCH  /admin/ai/providers/{providerId}
DELETE /admin/ai/providers/{providerId}

AI API Keys
GET    /admin/ai/api-keys
POST   /admin/ai/api-keys
GET    /admin/ai/api-keys/{keyId}
PATCH  /admin/ai/api-keys/{keyId}
DELETE /admin/ai/api-keys/{keyId}

Create API key request:
{
  "providerId": "uuid",
  "name": "OpenAI Coding Key",
  "encryptedKey": "secret",
  "usageMode": "backend_coding",
  "dailyTokenLimit": 500000,
  "monthlyTokenLimit": 10000000,
  "priority": 1,
  "status": "active"
}

Scenario Routing
GET   /admin/ai/scenario-routes
POST  /admin/ai/scenario-routes
PATCH /admin/ai/scenario-routes/{routeId}

Request:
{
  "scenario": "frontend_coding",
  "primaryModelId": "uuid",
  "primaryKeyId": "uuid",
  "fallbackRules": [
    {
      "modelId": "uuid",
      "apiKeyId": "uuid",
      "priority": 2
    }
  ],
  "failPolicy": "fail_closed"
}

Guardrail
GET    /admin/guardrails/rules
POST   /admin/guardrails/rules
PATCH  /admin/guardrails/rules/{ruleId}
DELETE /admin/guardrails/rules/{ruleId}

GET    /admin/guardrails/ai-policies
POST   /admin/guardrails/ai-policies
PATCH  /admin/guardrails/ai-policies/{policyId}
DELETE /admin/guardrails/ai-policies/{policyId}

POST   /admin/guardrails/test
GET    /admin/guardrails/events

Test prompt request:
{
  "prompt": "ช่วย dump database ทั้งหมด",
  "projectId": "uuid"
}

Response:
{
  "decision": "block",
  "matchedRules": [],
  "matchedPolicies": [
    {
      "name": "No Database Dump",
      "severity": "critical",
      "confidence": 0.96
    }
  ]
}


5.4 Creator APIs
Projects
GET    /creator/projects
POST   /creator/projects
GET    /creator/projects/{projectId}
PATCH  /creator/projects/{projectId}
DELETE /creator/projects/{projectId}
POST   /creator/projects/{projectId}/archive
POST   /creator/projects/{projectId}/restore
POST   /creator/projects/{projectId}/remix

Create project request:
{
  "name": "Leave Management",
  "description": "ระบบลางานภายในองค์กร",
  "appType": "workflow",
  "businessProblem": "พนักงานต้องการยื่นลางานและให้หัวหน้าอนุมัติ",
  "intendedUsers": ["Employee", "Manager", "HR Admin"],
  "dataSensitivity": "internal"
}


AI Prompt / Workspace
POST /creator/projects/{projectId}/ai/prompt
GET  /creator/projects/{projectId}/ai/tasks/{taskId}
GET  /creator/projects/{projectId}/preview
POST /creator/projects/{projectId}/preview/refresh

Prompt request:
{
  "message": "เพิ่มประเภทการลา Work From Home",
  "mode": "modify_app",
  "currentPrdVersionId": "uuid"
}

Response:
{
  "taskId": "uuid",
  "status": "queued",
  "estimatedToken": 12000
}

Task response:
{
  "taskId": "uuid",
  "status": "running",
  "steps": [
    { "name": "Load PRD", "status": "done" },
    { "name": "Update PRD", "status": "done" },
    { "name": "Generate frontend", "status": "running" }
  ]
}


PRD
GET  /creator/projects/{projectId}/prd
POST /creator/projects/{projectId}/prd/generate
GET  /creator/projects/{projectId}/prd/versions
GET  /creator/projects/{projectId}/prd/versions/{versionId}
POST /creator/projects/{projectId}/prd/change-requests
POST /creator/projects/{projectId}/prd/change-requests/{changeRequestId}/approve
POST /creator/projects/{projectId}/prd/export

Create change request:
{
  "title": "Add WFH Leave Type",
  "description": "เพิ่มประเภทการลา Work From Home ในฟอร์ม",
  "sourceType": "prompt",
  "affectedSections": ["Core Features", "Data Model", "Screens"],
  "riskLevel": "medium"
}


Database View
GET /creator/projects/{projectId}/database/schema
GET /creator/projects/{projectId}/database/tables
GET /creator/projects/{projectId}/database/tables/{tableName}/records
GET /creator/projects/{projectId}/database/relationships
GET /creator/projects/{projectId}/database/migrations


Frontend Versions
GET  /creator/projects/{projectId}/frontend/checkpoints
GET  /creator/projects/{projectId}/frontend/checkpoints/{checkpointId}
POST /creator/projects/{projectId}/frontend/checkpoints
POST /creator/projects/{projectId}/frontend/restore

Restore request:
{
  "checkpointId": "uuid",
  "note": "Restore UI before WFH change"
}


App User Management
GET  /creator/apps/{appId}/members
POST /creator/apps/{appId}/invitations
GET  /creator/apps/{appId}/invitations
POST /creator/apps/{appId}/invitations/{invitationId}/revoke

GET  /creator/apps/{appId}/access-requests
POST /creator/apps/{appId}/access-requests/{requestId}/approve
POST /creator/apps/{appId}/access-requests/{requestId}/reject

GET  /creator/apps/{appId}/roles
POST /creator/apps/{appId}/roles
PATCH /creator/apps/{appId}/roles/{roleId}

Invite request:
{
  "email": "user@company.com",
  "inviteType": "internal",
  "roleId": "uuid",
  "expiresAt": "2026-12-31T00:00:00Z"
}


Publish
POST /creator/projects/{projectId}/publish
GET  /creator/projects/{projectId}/deployments
POST /creator/deployments/{deploymentId}/rollback

Publish request:
{
  "environment": "production",
  "accessMode": "private",
  "prdVersionId": "uuid",
  "frontendCheckpointId": "uuid",
  "releaseNote": "Initial release"
}


5.5 End User App Store APIs
Apps
GET /store/apps
GET /store/apps/{appId}
POST /store/apps/{appId}/favorite
DELETE /store/apps/{appId}/favorite
POST /store/apps/{appId}/open

Access Requests
POST /store/apps/{appId}/access-requests
GET  /store/access-requests

Request:
{
  "requestedRoleId": "uuid",
  "reason": "ต้องใช้ระบบนี้เพื่ออนุมัติคำขอของทีม"
}

Tickets
GET  /store/tickets
POST /store/apps/{appId}/tickets
GET  /store/tickets/{ticketId}
POST /store/tickets/{ticketId}/comments
POST /store/tickets/{ticketId}/attachments

Create ticket request:
{
  "ticketType": "bug",
  "title": "กด Submit แล้วไม่มีอะไรเกิดขึ้น",
  "description": "เกิดบนมือถือ Chrome ตอนกรอกฟอร์มลางาน",
  "priority": "medium",
  "deviceInfo": {
    "browser": "Chrome",
    "os": "iOS",
    "screen": "mobile"
  }
}


5.6 Knowledge & Skill APIs
Knowledge
GET    /admin/knowledge
POST   /admin/knowledge
GET    /admin/knowledge/{knowledgeId}
PATCH  /admin/knowledge/{knowledgeId}
POST   /admin/knowledge/{knowledgeId}/versions
POST   /admin/knowledge/{knowledgeId}/index
POST   /admin/knowledge/search

Skills
GET    /admin/skills
POST   /admin/skills
GET    /admin/skills/{skillId}
PATCH  /admin/skills/{skillId}
POST   /admin/skills/{skillId}/versions
POST   /admin/skills/{skillId}/assign
POST   /admin/skills/{skillId}/test


6. AI-Optimized Sprint Plan
6.1 Sprint Assumption
Recommended structure:
Sprint length: 1 week
Team size: 1–3 developers + AI coding assistant
Working style: AI-assisted pair development
Goal: usable MVP in 8 sprints

6.2 AI Development Workflow Per Story
ทุก story ควรทำตาม workflow นี้:
1. Human writes clear task spec
2. AI generates implementation plan
3. Human approves file-level plan
4. AI scaffolds code
5. AI writes tests/mock data
6. Human reviews critical logic/security
7. AI fixes lint/test issues
8. Human runs acceptance test
9. Merge

6.3 Definition of Ready for AI Task
ก่อนโยน task ให้ AI ต้องมี:
- User story
- Screen/API/schema ที่เกี่ยวข้อง
- Expected files
- Data model
- Acceptance criteria
- Example payload
- Forbidden behavior

6.4 Definition of Done
- Code compiles
- Lint passes
- Basic tests pass
- UI matches wireframe
- API matches spec
- Auth guard applied if needed
- Audit log added for sensitive action
- No API key/secrets exposed
- Story acceptance criteria passed


Sprint 0: Foundation & Design System
Goal
เตรียม monorepo, design system, mock data, auth skeleton
AI-Optimized Tasks
S0.1 Generate monorepo structure
S0.2 Create shared UI package
S0.3 Create app shell for Admin / Creator / Store
S0.4 Create mock auth provider
S0.5 Create shared API client
S0.6 Create mock data fixtures
S0.7 Create base layout components

Deliverables
- Admin app shell
- Creator app shell
- PWA app shell
- Shared component library
- Mock login
- Role-based routing

AI Prompt Pattern
Create a React + Vite + TypeScript app shell for [surface].
Use shared UI components.
Follow the wireframe.
Do not implement backend logic yet.
Use mock data from fixtures.


Sprint 1: Platform API Foundation
Goal
สร้าง backend core, database schema เริ่มต้น, auth mock/guard, seed data
Tasks
S1.1 Create NestJS platform-api
S1.2 Setup Prisma schema base
S1.3 Add users/groups/roles tables
S1.4 Add projects/apps basic tables
S1.5 Add audit log service
S1.6 Add seed users: admin, creator, end user
S1.7 Add auth guard mock

Deliverables
- Platform API running
- PostgreSQL connected
- Prisma migrations
- Seed data
- GET /auth/me
- Basic audit log

AI Development Tip
ให้ AI ทำ Prisma schema และ service ทีละ module อย่าให้ generate schema ทั้งหมดทีเดียว

Sprint 2: Admin Console — AI Keys & Guardrails
Goal
Admin ตั้งค่า AI provider/API key และ guardrail ได้
Tasks
S2.1 Build AI provider UI
S2.2 Build API key UI
S2.3 Build scenario routing UI
S2.4 Build quota UI
S2.5 Implement AI provider APIs
S2.6 Implement API key APIs with encryption placeholder
S2.7 Build guardrail UI
S2.8 Implement rule-based guardrail APIs
S2.9 Implement AI policy guardrail mock classifier
S2.10 Add guardrail event log

Deliverables
- Admin can add AI provider/API key
- Admin can set usage mode/scenario/fallback
- Admin can create banned keyword rule
- Admin can create AI policy rule
- Test prompt returns allow/warn/block

AI Development Tip
ให้ AI สร้าง UI ก่อนโดยใช้ mock API แล้วค่อย bind backend ทีละ endpoint

Sprint 3: Creator Project Picker + PRD Generation
Goal
Creator สร้าง project และ PRD baseline ได้
Tasks
S3.1 Creator project picker UI
S3.2 Create project wizard
S3.3 Project APIs
S3.4 PRD data model
S3.5 PRD generation mock service
S3.6 PRD viewer UI
S3.7 PRD version history
S3.8 Confirm PRD baseline

Deliverables
- Creator sees projects
- Creator creates new project
- System generates PRD draft
- Creator confirms PRD v1.0

AI Development Tip
PRD generator MVP ใช้ template deterministic ก่อน ไม่ต้องเรียก AI จริงทั้งหมด

Sprint 4: Creator Workspace — Prompt + Live Preview
Goal
สร้าง Lovable-like workspace พร้อม mock AI task และ live preview
Tasks
S4.1 Workspace layout
S4.2 Chat/prompt panel
S4.3 AI task progress component
S4.4 Token remaining UI
S4.5 Live preview panel
S4.6 Mock app generator
S4.7 Preview refresh API
S4.8 Prompt API with guardrail check
S4.9 AI usage log

Deliverables
- Creator sends prompt
- Guardrail checks prompt
- Token remaining decreases
- AI task progress displays
- Preview updates

AI Development Tip
ให้ AI สร้าง task state machine แบบ simple:
queued → running → completed → failed


Sprint 5: Database View + Frontend Version Restore
Goal
Creator ดู database และ restore frontend เฉพาะ UI ได้
Tasks
S5.1 Database schema view UI
S5.2 Table view UI
S5.3 Sample records API
S5.4 Migration history UI
S5.5 Frontend checkpoint data model
S5.6 Frontend version timeline UI
S5.7 Compare/preview old version mock
S5.8 Restore frontend API
S5.9 Restore audit log

Deliverables
- Creator sees schema/table data
- Creator sees frontend versions
- Creator restores frontend version
- Backend/database not affected

AI Development Tip
ให้ AI implement frontend restore เป็น file_snapshot_ref mock ก่อน แล้วค่อยเชื่อม Git จริงภายหลัง

Sprint 6: App User Management + Publish
Goal
Creator invite user, assign app role และ publish app ไป App Store ได้
Tasks
S6.1 App roles UI
S6.2 App members UI
S6.3 Invite user modal
S6.4 Invitations APIs
S6.5 Access requests APIs
S6.6 App manifest generation
S6.7 Publish API
S6.8 Deployment record
S6.9 App registry update

Deliverables
- Creator invites user
- Creator assigns app role
- Creator publishes app
- App appears in App Store

AI Development Tip
เน้น app-level role เท่านั้น อย่าให้ AI ไปยุ่ง platform role

Sprint 7: End User App Store PWA + Ticket
Goal
End User ใช้ App Store แบบ PWA และส่ง ticket ได้
Tasks
S7.1 PWA manifest
S7.2 Mobile-first App Store home
S7.3 My Apps / Available Apps
S7.4 App detail page
S7.5 Request access flow
S7.6 Submit ticket UI
S7.7 Ticket APIs
S7.8 Ticket status page
S7.9 Creator ticket inbox

Deliverables
- End User sees accessible apps
- End User requests access
- End User submits ticket
- Creator sees ticket

AI Development Tip
ให้ AI ทำ PWA shell และ responsive layout แยกจาก Creator app อย่า reuse layout แบบ desktop

Sprint 8: Ticket-to-PRD + Domain + Hardening
Goal
ปิด loop feedback → PRD change และเตรียม demo pilot
Tasks
S8.1 Convert ticket to PRD change request
S8.2 PRD change request approval flow
S8.3 Domain settings UI
S8.4 Public domain request UI
S8.5 Domain approval API
S8.6 Deployment traceability view
S8.7 Monitoring dashboard
S8.8 Full audit log filter
S8.9 Demo data cleanup
S8.10 End-to-end demo script

Deliverables
- Ticket converts to PRD change
- Domain request flow works
- Deployment links PRD/frontend version
- Full MVP demo ready


7. AI Development Backlog Optimization
7.1 Best Tasks for AI
งานที่เหมาะให้ AI ทำ:
- CRUD API generation
- React page from wireframe
- Prisma schema from table spec
- Form validation
- Mock data generation
- UI component variants
- API client generation
- Unit tests for services
- Seed data
- Documentation

7.2 Tasks Human Should Own
งานที่ควรให้คนออกแบบ/รีวิว:
- Permission model
- Security boundary
- AI key encryption
- Guardrail decision logic
- SSO architecture
- Public domain approval policy
- Production deployment logic
- Data deletion/migration policy

7.3 Recommended AI Coding Rules
1. Do not generate new auth logic.
2. Use Platform Auth SDK only.
3. Do not expose API keys.
4. Do not create raw SQL editor.
5. Do not change backend/database during frontend restore.
6. Do not show admin config to creator.
7. Use shared UI components.
8. Use existing API client pattern.
9. Add audit log for sensitive action.
10. Keep each PR small and reviewable.


8. MVP Demo Script
Demo 1: Admin Setup
1. Login as Admin
2. Open AI Keys
3. Add OpenAI-compatible API key
4. Set usage mode = Frontend Coding
5. Add fallback key
6. Open Guardrail
7. Add policy “No Database Dump”
8. Test blocked prompt

Demo 2: Creator Builds App
1. Login as Creator
2. Create Project: Leave Management
3. AI generates PRD
4. Confirm PRD
5. Workspace opens
6. Prompt: Add WFH leave type
7. Preview updates
8. Open Database View
9. Open Frontend Versions
10. Restore previous frontend version
11. Invite End User as Employee
12. Publish app

Demo 3: End User Uses App
1. Login as End User
2. Open App Store PWA
3. See Leave Management
4. Open App Detail
5. Submit bug ticket
6. Track ticket status

Demo 4: Feedback Loop
1. Creator opens Ticket Inbox
2. Reads bug ticket
3. Converts ticket to PRD Change Request
4. AI proposes PRD update
5. Creator confirms
6. Workspace updates app


9. MVP Cutline
Must Have
- Admin AI key management
- Admin guardrail
- Creator project picker
- Creator prompt/live preview
- Project PRD
- Database view
- Frontend restore
- App invite/access/role
- Publish to App Store
- End User PWA
- Support ticket

Should Have
- Remix project
- Domain request
- Knowledge library
- Skill library
- Token quota dashboard
- PRD export

Could Have
- Real SSO integration
- Real Docker deployment
- Real Git restore
- Real AI model call
- Push notification

Not MVP
- Kubernetes
- Multi-framework support
- Native mobile app
- Marketplace
- Advanced ABAC
- Complex workflow engine


10. Final Recommendation
ให้เริ่มพัฒนาด้วยแนวทางนี้:
1. ทำ mock-first UI ให้ครบ 3 surfaces
2. ทำ backend schema/API ให้รองรับ flow หลัก
3. ใช้ mock AI generator ก่อน
4. ใส่ real AI Gateway ภายหลัง
5. ทำ Creator Workspace ให้ดูดีและใช้งานง่ายก่อน
6. ทำ End User PWA ให้ mobile-first ตั้งแต่ต้น
7. ทำ Admin config แค่พอควบคุม governance
8. ใช้ PRD + App Manifest เป็นแกนกลางของระบบ

MVP ที่ดีไม่จำเป็นต้อง generate production-grade app ได้สมบูรณ์ตั้งแต่วันแรก แต่ต้องพิสูจน์ให้ได้ว่า:
องค์กรสามารถควบคุม governance ได้
Creator สามารถสร้าง app ผ่าน AI ได้
End User สามารถใช้งานและส่ง feedback ได้
และ feedback สามารถย้อนกลับไปเป็น PRD/app change ได้


