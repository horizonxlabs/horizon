Product Requirements Document
Enterprise Vibe Coding Platform
Private AI Application Builder for Organizations
Version: 0.3
Status: Product Reference / Development Blueprint
Target: MVP → Enterprise Pilot → Production Rollout
Language: Thai
Primary Deployment: Private Server / On-premise / Private Cloud
Core Principle: Easy to Install, Easy to Maintain, Governance-first, Web-first

1. Executive Summary
Enterprise Vibe Coding Platform คือแพลตฟอร์มสำหรับให้องค์กรสร้าง Web Application ภายในด้วย AI ผ่านประสบการณ์แบบ Lovable โดยมีการควบคุมระดับองค์กรครบถ้วน เช่น Authentication กลาง, SSO, App-level access, AI API Key Policy, Token Quota, Guardrail, Knowledge Management, Skill Management, PRD Lifecycle, Internal App Store และ Deployment Governance
ระบบนี้ไม่ได้เป็นเพียง AI Coding Tool แต่เป็น Private AI Software Factory สำหรับองค์กร
เป้าหมายคือให้ Business User หรือ Creator สามารถสร้าง Internal App ได้เองผ่าน Web UI โดยไม่ต้องติดตั้งโปรแกรมลงเครื่องส่วนตัว ขณะที่ IT/System Admin ยังสามารถควบคุม infrastructure, security, AI model, SSO, domain, deployment และ monitoring ได้จากระบบกลาง
ระบบแบ่งออกเป็น 3 Product Surfaces หลัก:
1. IT/System Admin Software
   สำหรับติดตั้ง ตั้งค่า ดูแล platform และ governance กลาง

2. Creator App
   Web desktop app สำหรับ Creator / Vibe Coder ใช้สร้าง app ด้วย AI

3. End User App Store
   Progressive Web App สำหรับพนักงานทั่วไปใช้เข้าถึง app, ขอสิทธิ์, แจ้ง bug และส่ง feedback


2. Product Vision
สร้างแพลตฟอร์มที่ทำให้องค์กรสามารถมี AI Software Factory ส่วนตัว ติดตั้งใน private server โดย Business User สามารถสร้าง internal application ได้รวดเร็วเหมือนใช้ Lovable แต่ทุก app ที่สร้างจะใช้มาตรฐานกลางขององค์กรโดยอัตโนมัติ
ระบบต้องทำให้ AI Agent ขององค์กรมีความรู้เฉพาะขององค์กร เช่น coding standard, API spec, UI template, business rule, security policy และ project PRD เพื่อให้การสร้าง app เป็นไปตามบริบทจริงขององค์กร ไม่ใช่ใช้ model knowledge ทั่วไปเพียงอย่างเดียว

3. Product Positioning
3.1 ระบบนี้คืออะไร
ระบบนี้คือ:
Private Lovable-like Platform สำหรับองค์กร
Enterprise Vibe Coding Platform
AI Application Builder
Internal App Factory
Internal App Store
AI-assisted Software Development Platform
Governance-controlled Creator Platform
Private AI Software Factory
3.2 ระบบนี้ไม่ใช่อะไรใน MVP
ระบบนี้ยังไม่ใช่:
Low-code drag-and-drop platform เต็มรูปแบบ
IDE สำหรับ developer แบบ VS Code เต็มรูปแบบ
Kubernetes platform ซับซ้อน
Multi-cloud deployment platform
ระบบที่รองรับทุก programming language
ระบบที่ให้ AI เลือก tech stack เองโดยอิสระ
Marketplace เปิดสำหรับ third-party plugin แบบเต็มรูปแบบ
Native mobile app builder

4. Product Goals
4.1 Business Goals
ลดเวลาการสร้าง internal application
ลด backlog ของทีม IT
เปิดให้ business unit สร้าง app เองได้ภายใต้ governance
ทำให้ทุก app ใช้มาตรฐานกลางขององค์กร
ทำให้ app ภายในองค์กรถูกค้นหา ใช้ซ้ำ และดูแลได้ผ่าน internal app store
สร้าง feedback loop จาก end user กลับไปยัง creator ผ่าน support ticket
ลดต้นทุนเริ่มต้นด้วย deployment ที่ง่ายและดูแลรักษาง่าย
4.2 Technical Goals
ติดตั้งบน private server ได้ง่าย
Creator และ End User ใช้งานผ่าน browser ได้ทั้งหมด
Admin มี installer/setup software สำหรับติดตั้งและดูแลระบบ
ทุก app ใช้ authentication กลางหรือ SSO องค์กร
แต่ละ app มี invite/access/role ของตัวเอง
AI API key รองรับ usage mode, quota, scenario และ fallback
Guardrail รองรับทั้ง banned keyword และ AI policy
AI Agent มี central skill และ central knowledge
ทุก project มี PRD เป็น source of truth
ทุก deployment ผูกกับ PRD version, code version และ app manifest
App รองรับ internal domain และ public/custom domain ตาม governance

5. Product Surface Architecture
ระบบแบ่ง UI และประสบการณ์ผู้ใช้ออกเป็น 3 ส่วนหลัก
Surface
Target User
Form Factor
Primary Purpose
IT/System Admin Software
IT, System Admin, Provider
Installer Software + Web Admin Console
ติดตั้ง ตั้งค่า ดูแล platform กลาง
Creator App
Creator, Vibe Coder, Power User, Developer
Web Desktop App
สร้าง app, prompt, preview, database, version, invite
End User App Store
Employee, External User
Progressive Web App
เข้าใช้ app, ขอสิทธิ์, แจ้ง ticket, feedback


6. Surface 1: IT/System Admin Software
6.1 Objective
IT/System Admin Software คือเครื่องมือสำหรับติดตั้งและดูแลระบบกลางของ platform โดยไม่ปะปนกับ Creator App
System Admin ต้องสามารถ:
ติดตั้ง platform ลง private server
ตรวจสอบ preflight
ตั้งค่า domain
ตั้งค่า SSO
ตั้งค่า AI provider/API key
ตั้งค่า guardrail
ตั้งค่า backup
ตรวจ health ของระบบ
upgrade/rollback platform
monitor infrastructure
ดู audit log
6.2 Recommended Form
สำหรับ MVP แนะนำให้เป็น:
Installer CLI
+ Local Web Setup Wizard
+ Web-based Admin Console

ยังไม่จำเป็นต้องเป็น native desktop app
ตัวอย่าง:
antigravity-installer
antigravity setup
antigravity status
antigravity backup
antigravity upgrade

6.3 Installation Flow
IT Admin downloads signed installer
  ↓
Runs preflight check
  ↓
Opens local web setup wizard
  ↓
Configures domain, storage, database, SSO, AI gateway
  ↓
Installer deploys Docker Compose stack
  ↓
Runs health check
  ↓
Creates first admin account
  ↓
Opens Admin Console

6.4 Installer Wizard Pages
Page 1: Welcome / License
Functions:
Show product version
Accept license
Select installation mode
Select language
Installation modes:
Single Server
Private VM
Air-gapped package optional

Page 2: Server Preflight Check
Checks:
CPU
RAM
Disk
OS
Docker
Docker Compose
Available ports
Network access
DNS
TLS readiness

Page 3: Domain Setup
Fields:
Platform domain
Creator app domain
App store domain
Generated app base path/domain
Public domain policy

Default MVP path-based routing:
https://platform.company.com/admin
https://platform.company.com/creator
https://platform.company.com/store
https://platform.company.com/apps/{app-slug}

Page 4: Database Setup
Options:
Use bundled PostgreSQL
Use existing PostgreSQL

Default:
Bundled PostgreSQL in Docker Compose

Page 5: Storage Setup
Options:
Bundled MinIO
Existing S3-compatible storage

Page 6: Authentication Setup
Options:
Local Auth
SSO via OIDC
SSO via SAML
LDAP / Active Directory

Default:
Keycloak as Identity Broker

Page 7: AI Gateway Setup
Functions:
Add first AI provider
Add API key
Select default model
Set default token quota
Enable/disable external model usage
Page 8: Guardrail Setup
Functions:
Enable default banned keyword rules
Enable default AI policy guardrails
Set security notification target
Page 9: Backup Setup
Fields:
Backup path
Backup schedule
Retention policy
Backup encryption

Page 10: Install Progress
Shows:
Pulling images
Starting PostgreSQL
Starting Keycloak
Starting MinIO
Starting Redis
Starting Platform API
Starting Platform Frontend
Applying migrations
Creating default realm
Creating admin user
Running health check

Page 11: Finish
Actions:
Open Admin Console
Download install report
View system status

6.5 Admin Console Modules
Admin Console must include:
System Health
Services
Users & Groups
Authentication / SSO
AI Providers
API Keys
Token Quotas
Guardrails
Knowledge
Skills
Templates
Domains
Deployments
Backups
Upgrade
License
Monitoring
Audit Logs
System Settings

6.6 Admin Boundary
Creator User must not access:
System configuration
Server configuration
AI API keys
Model provider settings
SSO settings
Global guardrail settings
Infrastructure settings
Backup settings
Platform upgrade settings


7. Surface 2: Creator App
7.1 Objective
Creator App คือ Web Desktop App สำหรับ Creator หรือ Vibe Coder ใช้สร้าง แก้ ทดสอบ และ publish internal app ผ่าน AI
Creator ต้องสามารถ:
เลือก project
สร้าง project ใหม่
remix project
prompt AI เพื่อสร้าง app
ดู live preview
ดู PRD
ดู database table
ดู API
restore frontend version
invite user เข้า app
กำหนด role ภายใน app
เห็น token remaining ของตัวเอง
publish app ตามสิทธิ์
ดู feedback/support ticket จาก end user
7.2 Form Factor
Web-based desktop application
Optimized for laptop/desktop
No local installation required
Browser-based only

MVP ไม่จำเป็นต้อง mobile-first สำหรับ Creator App เพราะ workspace ต้องใช้พื้นที่หน้าจอมาก
7.3 Creator App Main Pages
Creator Home
Project Picker
Create Project
Project Workspace
Prompt Builder / Live Preview
Project PRD
Database View
API View
Frontend Versions
Remix Project
App User Management
App Roles
Support Tickets
Token Usage
Publish / Domain
Settings


8. Creator App: Project Picker
8.1 Objective
ให้ Creator เห็น project ทั้งหมดที่ตนเองสร้างหรือมีสิทธิ์ร่วมแก้ไข
8.2 Project Categories
My Projects
Shared with Me
Draft Apps
Published Apps
Remixed Projects
Archived Projects
Templates

8.3 Project Card Fields
Project name
App type
Status
Owner
Last edited
Last published
PRD version
Frontend version
Access mode
Health status
Token used this month

8.4 Actions
Open Project
Create New Project
Remix Project
Duplicate Project
Archive Project
Restore Archived Project
View PRD
View Published App


9. Creator App: Prompt Builder / Live Preview
9.1 Objective
เป็น workspace หลักแบบ Lovable สำหรับให้ Creator สั่ง AI สร้างหรือแก้ app พร้อมดู live preview
9.2 Layout
Top Bar:
Project name / PRD version / Frontend version / Token remaining / Publish button

Left Panel:
Prompt builder / Chat / AI plan / Task progress

Center Panel:
Live preview

Right Panel:
PRD / Database / Versions / Users / Logs / API / Tickets

9.3 Prompt Builder Functions
Creator can:
Describe app requirement
Ask AI to create screen
Ask AI to modify UI
Ask AI to add field
Ask AI to create workflow
Ask AI to update PRD
Ask AI to generate report
Ask AI to fix preview error
Ask AI to explain current app

9.4 AI Task Progress
System shows:
Understanding request
Loading PRD
Retrieving knowledge
Selecting skill
Updating PRD if needed
Generating frontend
Generating backend if needed
Applying auth/role rules
Building preview
Running checks
Ready

9.5 Live Preview Functions
Creator can:
Preview desktop
Preview tablet
Preview mobile
Open preview in new tab
Refresh preview
Share preview link
Capture screenshot for AI
Select UI element optional

9.6 Creator Token Remaining
Creator must see:
Token remaining today
Token remaining this month
Current project token usage
Estimated token for current request
Quota reset date
Request more token quota

Creator must not see:
API key
Provider secret
System-wide model configuration
Other users’ token usage


10. Creator App: Database Table View
10.1 Objective
ให้ Creator ดูโครงสร้างและข้อมูลของ app ที่กำลังสร้างในมุม business-friendly
10.2 Database View Modes
Schema View
Table View
Relationship View
Sample Data View
Migration History

10.3 Schema View
Shows:
Tables
Columns
Data types
Required fields
Default values
Relationships
Indexes
Generated by AI / manually modified

10.4 Table View
Creator can:
View records
Search records
Filter records
Sort columns
View related records
Export sample data optional

10.5 Restrictions
Creator must not be able to do these directly in MVP:
Run raw SQL
Drop table
Delete production data
Change schema without AI migration flow
Bypass permission
Access other app database

10.6 Schema Change Flow
If Creator asks AI to change database:
Creator prompt
  ↓
AI analyzes impact
  ↓
AI proposes PRD update
  ↓
AI proposes schema migration
  ↓
Creator confirms
  ↓
System creates migration
  ↓
Preview environment applies migration
  ↓
Production deployment requires approval if destructive


11. Creator App: Frontend Version Restore
11.1 Objective
Creator ต้องสามารถย้อน version ของ frontend ได้แบบ Lovable โดยไม่กระทบ backend, database, auth, permission หรือ production data
11.2 Scope
Frontend restore affects only:
React pages
UI components
CSS/Tailwind styles
Layout
Client-side state
Frontend routing

Frontend restore must not affect:
Backend APIs
Database schema
Production data
Auth settings
App roles
App permissions
App membership
Domain settings
PRD baseline unless user confirms

11.3 Frontend Checkpoint
System automatically creates checkpoint when:
AI modifies frontend
Creator publishes app
Creator manually creates checkpoint
Frontend restore is completed

11.4 Version UI
Creator can:
View frontend version timeline
Preview old version
Compare current vs selected version
Restore selected frontend version
Create branch from version optional
Add version note

11.5 Restore Flow
Creator selects frontend version
  ↓
System shows preview and diff
  ↓
Creator confirms restore
  ↓
System restores frontend files only
  ↓
System creates new checkpoint
  ↓
System rebuilds preview


12. Creator App: Remix Project
12.1 Objective
Creator สามารถสร้าง project ใหม่จาก project เดิม template หรือ published app ที่มีสิทธิ์ได้
12.2 Remix Types
Remix frontend only
Remix full app
Remix as template
Remix from published app
Remix from organization template

12.3 Remix Options
Copy PRD
Copy frontend
Copy backend
Copy database schema
Copy sample data
Remove production data
Copy roles
Copy permissions
Reset members
Reset domain
Create new app slug

Default safe remix:
Copy PRD
Copy frontend
Copy backend
Copy schema
Remove production data
Reset members
Reset domain

12.4 Remix Permission
Creator can remix only if:
Project owner allows remix
Template is organization-approved
User has project view/remix permission
Sensitive app is not restricted


13. Creator App: App User Management
13.1 Objective
Creator หรือ App Owner สามารถจัดการ user ที่เข้าใช้งาน app ของตนเองได้ แต่ไม่สามารถจัดการ user ทั้งองค์กร
13.2 Invite Methods
Invite internal user
Invite external user by email
Invite department/group
Invite SSO group
Bulk invite
Approve access request

13.3 App-level Roles
แต่ละ app กำหนด role ของตัวเองได้ เช่น:
Employee
Manager
Approver
HR Admin
Finance Viewer
Auditor
External Vendor

13.4 Invite Flow
Creator opens App User Management
  ↓
Select Invite User
  ↓
Enter email/user/group
  ↓
Assign app role
  ↓
Send invite
  ↓
User receives invite
  ↓
User logs in with central account/SSO
  ↓
Platform grants app membership
  ↓
User can access app

13.5 External User
External user must be controlled by policy:
Allowed only if app allows external access
External invite may require approval
External user must be clearly marked
External user access can expire
External user may use email-based identity or federated identity

13.6 Creator User Management Permissions
Creator can:
Invite user to own app
Assign app role
Remove user from own app
Approve access request for own app
View app members
View pending invites
View user role in own app

Creator cannot:
Create platform admin
Change SSO settings
View all organization users beyond search result allowed
Change global user profile
Change global group mapping
View other app members unless authorized


14. Creator App: Support Ticket Inbox
14.1 Objective
Creator ต้องเห็น bug report, feedback และ feature request จาก End User ของ app ที่ตนเองดูแล
14.2 Ticket Types
Bug Report
Feedback
Feature Request
Access Issue
Data Issue
Performance Issue
Other

14.3 Ticket Status
Open
In Review
Planned
In Progress
Resolved
Closed
Rejected

14.4 Creator Actions
Creator can:
View ticket
Assign ticket
Change status
Reply to user
Link ticket to project change
Ask AI to analyze ticket
Convert ticket to PRD change request
Convert ticket to AI prompt
Mark resolved

14.5 Ticket-to-PRD Flow
End user submits ticket
  ↓
Creator reviews ticket
  ↓
Creator clicks Convert to Change Request
  ↓
AI analyzes affected PRD sections
  ↓
AI creates PRD change proposal
  ↓
Creator confirms
  ↓
AI updates app


15. Surface 3: End User App Store PWA
15.1 Objective
End User App Store คือ PWA สำหรับพนักงานทั่วไปหรือ external user ใช้ค้นหา เปิด app ขอสิทธิ์ และส่ง feedback/bug report
15.2 Form Factor
Progressive Web App
Mobile-first
Installable on mobile home screen
Works on desktop browser
No app store installation required

15.3 PWA Requirements
Web app manifest
Home screen icon
Responsive layout
Service worker
Cached app shell
Offline fallback page
Push notification optional
Deep link to app
Session persistence

MVP:
Installable PWA
Mobile responsive
Offline fallback
Basic notification in-app

Post-MVP:
Push notification
Offline ticket draft
Background sync

15.4 End User App Store Modules
My Apps
Available Apps
Favorites
Recently Used
Request Access
App Detail
My Access
Support Ticket
Bug Report
Feedback
Feature Request
Ticket Status
Notifications
Profile

15.5 App Visibility
End User sees app based on:
App membership
App role
Organization-wide access
Group-restricted access
Public access
Pending invite
Pending access request

15.6 App Card Fields
App icon
App name
Description
Owner
Category
My role
Access status
Health status
Last updated
Open button
Request access button
Favorite button

15.7 App Detail Page
Shows:
App name
Description
Owner
Creator
Department
My role
Access mode
URL
Status
Health
Release notes
Support contact
Request access
Open app
Submit ticket

15.8 Request Access Flow
User sees app but has no access
  ↓
Clicks Request Access
  ↓
Selects reason
  ↓
Request sent to App Owner/Creator
  ↓
Creator approves/rejects
  ↓
User receives notification
  ↓
If approved, app appears in My Apps

15.9 Support Ticket Flow
End User opens app detail
  ↓
Clicks Report Bug / Send Feedback
  ↓
Selects ticket type
  ↓
Enters title, description, screenshot optional
  ↓
System attaches app, user, device/browser info
  ↓
Ticket routed to Creator/App Owner
  ↓
User tracks ticket status


16. Authentication & App Access Architecture
16.1 Principle
One central account, multiple app-level roles

ทุก user ใช้ account กลางเดียว แต่แต่ละ app มี role/access ของตัวเอง
16.2 Architecture
Corporate SSO / Local Account
  ↓
Keycloak Identity Broker
  ↓
Platform Auth Service
  ↓
Platform Role / Project Role / App Role
  ↓
Generated Apps

16.3 Supported Auth Modes
Local Auth
OIDC SSO
SAML SSO
LDAP / Active Directory
Azure AD / Entra ID
Okta
Google Workspace

16.4 Role Layers
Platform Role
Platform Admin
AI Admin
Security Admin
Developer
Creator
Viewer

Project Role
Project Owner
Project Editor
Project Reviewer
Project Viewer

App Role
Custom per app:
Employee
Manager
Approver
HR Admin
Finance Viewer
External Vendor
Auditor

16.5 App Access Modes
Private App
Organization App
Group-restricted App
Public App
External Shared App


17. AI Provider, Model & API Key Management
17.1 Objective
AI Admin ต้องสามารถจัดการ AI provider, model และ API key ได้หลายชุด โดยแต่ละ key ต้องกำหนด usage mode, quota, scenario และ fallback ได้
17.2 Supported Provider Type
MVP รองรับ OpenAI-compatible API เป็นหลัก:
OpenAI
Azure OpenAI
OpenRouter
Ollama
vLLM
Custom OpenAI-compatible endpoint

17.3 API Key Fields
Key name
Provider
Base URL
Model list
Encrypted API key
Owner
Status
Environment
Allowed scenarios
Allowed user groups
Allowed projects
Usage mode
Priority
Fallback order
Daily token limit
Monthly token limit
Daily cost limit
Monthly cost limit
Concurrent request limit
Rate limit
Last used

17.4 Usage Modes
General
Requirement Analysis
Planning
Frontend Coding
Backend Coding
Database Design
Code Review
Documentation
Vision Review
Sensitive Project
Local-only
Fallback-only
Production-only
Development-only

17.5 Scenario Routing
Example:
Requirement Analysis → Model A / Key 1
Frontend Coding → Model B / Key 2
Backend Coding → Model B / Key 2
Security Review → Secure Model / Key 3
Sensitive Prompt → Local Model / Local Key
Documentation → Low-cost Model / Key 4

17.6 Fallback
Primary model/key
Fallback model/key 1
Fallback model/key 2
Fail closed / fail open policy

17.7 Token Quota
Quota levels:
Per user
Per group
Per project
Per department
Per model
Per API key
Per scenario
Per day
Per month


18. Guardrail Policy Engine
18.1 Objective
ระบบต้องมี Guardrail ทั้งแบบ Rule-based และ AI Policy เพื่อควบคุม prompt, response และ AI action ตามนโยบายองค์กร
18.2 Rule-based Guardrail
Banned keyword
Regex
PII pattern
Secret pattern
File path pattern
Command pattern
URL/domain pattern
Source code leak pattern

18.3 AI Policy Guardrail
ใช้ตรวจ intent ที่ keyword อย่างเดียวจับไม่ได้
Examples:
ห้าม bypass authentication
ห้าม dump database
ห้าม disable audit log
ห้าม export sensitive data ออกภายนอก
ห้ามสร้าง public endpoint ที่ expose confidential data
ห้ามส่ง secret/API key เข้า external model
ห้ามแนะนำวิธีหลบ security control

18.4 Guardrail Actions
Allow
Detect and notify
Warn user
Require approval
Block
Escalate to Security Admin

18.5 Guardrail Flow
User Prompt
  ↓
Keyword / Regex / PII / Secret check
  ↓
AI Policy Classifier
  ↓
Decision
  ↓
Audit Log
  ↓
AI Gateway


19. Central Agent Skill Management
19.1 Objective
AI Admin สามารถเพิ่ม จัดการ version และ assign skill ให้ Agent กลางขององค์กรได้
19.2 Skill Definition
Skill คือชุด instruction, workflow, template หรือ tool usage pattern ที่ทำให้ agent ทำงานเฉพาะทางได้
Examples:
Create CRUD App
Create Approval Workflow
Create Dashboard
Create Report App
Connect Internal API
Generate OpenAPI Spec
Generate PRD
Review Security Risk
Generate Test Case
Create RBAC Permission Matrix

19.3 Skill Types
Prompt Skill
Template Skill
Tool Skill
Workflow Skill
Integration Skill
Review Skill
Documentation Skill
Security Skill
Deployment Skill

19.4 Agent Roles
Requirement Analyst
Solution Architect
Database Designer
Frontend Developer
Backend Developer
Auth/RBAC Specialist
QA Reviewer
Security Reviewer
Deployment Assistant
Documentation Writer


20. Central Knowledge Management
20.1 Objective
ระบบต้องมี knowledge กลางให้ AI Agent ใช้ความรู้เฉพาะขององค์กร เช่น coding standard, API, template, business rule และ security policy
20.2 Knowledge Types
Coding Standard
Architecture Guideline
API Specification
Database Dictionary
Business Process
SOP
Security Policy
UX/UI Guideline
Component Documentation
Deployment Standard
Naming Convention
Integration Manual

20.3 Supported Sources
MVP:
PDF
Markdown
Text
Word
Excel
OpenAPI JSON
Manual entry

Post-MVP:
Confluence
SharePoint
Internal Wiki
Git Repository
Database Schema Scanner
API Catalog

20.4 Knowledge Scope
Global
Department
Team
Project
App
Agent-specific

20.5 Knowledge Retrieval
User Prompt
  ↓
Analyze intent
  ↓
Identify project/department/scenario
  ↓
Retrieve relevant knowledge
  ↓
Apply permission filter
  ↓
Inject context into agent


21. Project PRD Lifecycle Management
21.1 Objective
ทุก project ต้องมี PRD ที่ AI สร้าง เก็บ version อัปเดต และใช้เป็น source of truth ตลอดการพัฒนา
21.2 Principle
No serious app generation without PRD baseline

21.3 PRD Structure
1. Project Overview
2. Business Objective
3. Target Users
4. User Roles
5. Access Policy
6. Core Features
7. User Flows
8. Screens / Pages
9. Data Model
10. Workflow Rules
11. Permission Matrix
12. Integration Requirements
13. Notification Requirements
14. Report / Export Requirements
15. Non-functional Requirements
16. Security Requirements
17. Deployment Requirements
18. Domain Requirements
19. Support / Feedback Requirements
20. Acceptance Criteria
21. Open Questions
22. Change Log

21.4 PRD Creation Flow
Creator creates new project
  ↓
AI asks requirement questions
  ↓
AI generates initial PRD
  ↓
Creator reviews PRD
  ↓
Creator confirms baseline
  ↓
System creates project workspace
  ↓
AI generates app based on PRD

21.5 PRD Update Flow
Creator requests change
  ↓
AI loads current PRD
  ↓
AI analyzes impact
  ↓
AI identifies affected sections
  ↓
AI generates PRD change proposal
  ↓
Creator confirms
  ↓
System creates new PRD version
  ↓
AI updates app

21.6 Ticket-to-PRD Flow
End user submits ticket
  ↓
Creator reviews ticket
  ↓
Creator converts ticket to change request
  ↓
AI analyzes PRD impact
  ↓
PRD updated
  ↓
App updated

21.7 PRD Versioning
v0.1 Draft
v1.0 Baseline
v1.1 Minor update
v2.0 Major change

21.8 Deployment Traceability
Every deployment links to:
PRD version
App manifest version
Git commit
Docker image tag
Database migration version
Frontend version
Deployment note


22. App Generator
22.1 Objective
AI ต้อง generate app จาก PRD, template, skill และ knowledge ไม่ใช่ generate แบบไม่มีโครงสร้าง
22.2 Standard Generated Stack
Frontend:
React
Vite
TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
React Router
Platform Auth SDK

Backend:
NestJS
TypeScript
Prisma
PostgreSQL schema per app
REST API
OpenAPI
Platform Auth Guard
Platform Permission Guard

22.3 Supported App Types
MVP:
CRUD App
Workflow App
Dashboard App
Form App
Internal Portal
Report App
Approval App

22.4 Generated Artifacts
Frontend pages
Backend APIs
Prisma schema
Database migration
App manifest
Role/permission matrix
Auth integration
Access management integration
OpenAPI spec
README
Test checklist
Deployment config
PRD link


23. App Manifest
Every app must have manifest:
{
  "appId": "leave-management",
  "name": "Leave Management",
  "owner": "HR Department",
  "creator": "creator@example.com",
  "accessMode": "private",
  "roles": ["Employee", "Manager", "HR Admin"],
  "permissions": [
    "leave.request.create",
    "leave.request.view_own",
    "leave.request.view_team",
    "leave.request.approve",
    "leave.policy.manage"
  ],
  "auth": {
    "provider": "platform",
    "ssoRequired": true
  },
  "domain": {
    "internalPath": "/apps/leave-management",
    "publicAccess": false
  },
  "prd": {
    "currentVersion": "v1.0"
  },
  "frontend": {
    "currentVersion": "frontend-v12"
  }
}


24. Domain & Routing Management
24.1 Domain Types
Admin domain
Creator domain
App Store domain
Generated internal app domain
Public/custom app domain

24.2 Recommended MVP Path-based Routing
https://platform.company.com/admin
https://platform.company.com/creator
https://platform.company.com/store
https://platform.company.com/apps/{app-slug}
https://platform.company.com/preview/{project-slug}

24.3 Subdomain Option
https://creator.company.com
https://apps.company.com
https://leave.apps.company.com

24.4 Public Domain Governance
Creator requests public domain
  ↓
System runs security checklist
  ↓
Security Admin reviews
  ↓
System Admin approves DNS/SSL/routing
  ↓
Public route enabled
  ↓
Audit log created


25. Deployment
25.1 Deployment Environments
MVP:
Development
Production

Post-MVP:
UAT
Staging

25.2 Deployment Flow
Build production image
  ↓
Run database migration
  ↓
Start app containers
  ↓
Register route
  ↓
Run health check
  ↓
Register/update App Store
  ↓
Link deployment to PRD version
  ↓
Write deployment log

25.3 Rollback
Rollback must include:
Git commit
Docker image
App manifest
Environment variables
PRD reference
Frontend version

Frontend-only rollback must be available to Creator without changing backend/database.

26. Internal App Store
26.1 Objective
เป็นศูนย์กลางให้ End User ค้นหาและเข้าใช้งาน app ที่ตนเองมีสิทธิ์
26.2 Functions
Search app
Filter by department
Filter by category
Open app
Request access
View app detail
View owner
View creator
View role
View health
Submit support ticket
Favorite app
View recently used

26.3 App Visibility
App Store shows app based on:
App membership
App role
Organization-wide access
Group-restricted access
Public access
Pending invite
Pending access request


27. Support Ticket System
27.1 Objective
ให้ End User ส่ง feedback, bug report, access issue หรือ feature request ไปยัง Creator/App Owner ได้
27.2 Ticket Types
Bug Report
Feedback
Feature Request
Access Issue
Data Issue
Performance Issue
Security Concern
Other

27.3 Ticket Routing
Bug/Feedback/Feature → Creator/App Owner
Access Issue → App Owner
Security Concern → Security Admin + App Owner
Critical Issue → App Owner + System Admin

27.4 Ticket Fields
Ticket ID
App
Ticket type
Title
Description
Screenshot
Priority
Device/browser info
Submitted by
Assigned creator
Status
Timeline
Comments
Related PRD change
Related deployment


28. UI Page Summary
28.1 IT/System Admin Software
Pages:
Installer Welcome
Preflight Check
Domain Setup
Database Setup
Storage Setup
SSO Setup
AI Gateway Setup
Guardrail Setup
Backup Setup
Install Progress
Admin Dashboard
System Health
AI Providers/API Keys
Guardrails
Knowledge
Skills
Domains
Deployments
Audit Logs
Backup/Restore
Upgrade

28.2 Creator App
Pages:
Creator Home
Project Picker
Create Project
Prompt Builder / Live Preview
Project PRD
Database View
API View
Frontend Versions
Remix Project
App User Management
App Roles
Support Ticket Inbox
Token Usage
Publish / Domain
Project Settings

28.3 End User App Store PWA
Pages:
My Apps
Available Apps
Favorites
Recently Used
App Detail
Request Access
Support Ticket
Ticket Status
My Access
Notifications
Profile


29. Data Model
29.1 AI Management
ai_providers
ai_models
ai_api_keys
ai_key_usage_policies
ai_scenario_routes
ai_fallback_rules
ai_usage_logs
ai_cost_logs
ai_quota_policies

29.2 Guardrail
guardrail_rules
guardrail_ai_policies
guardrail_events
guardrail_approval_requests
guardrail_policy_versions

29.3 Auth & Access
platform_users
platform_groups
platform_roles
platform_permissions
platform_user_groups
platform_user_roles

apps
app_roles
app_permissions
app_members
app_invitations
app_group_access
app_role_assignments
app_access_requests

29.4 Creator Projects
projects
project_members
project_versions
project_files
project_settings
project_remixes
frontend_checkpoints
frontend_restore_logs

29.5 PRD
project_prds
project_prd_versions
project_prd_sections
project_prd_change_requests
project_prd_approvals
project_prd_comments
project_prd_exports

29.6 Knowledge & Skill
knowledge_items
knowledge_versions
knowledge_chunks
knowledge_indexes
knowledge_permissions
knowledge_usage_logs

agent_skills
agent_skill_versions
agent_skill_assignments
agent_skill_usage_logs
agent_configurations

29.7 Tickets
support_tickets
support_ticket_comments
support_ticket_attachments
support_ticket_status_logs
support_ticket_prd_links

29.8 Deployment & Domain
deployments
deployment_logs
app_domains
domain_requests
domain_approvals
ssl_certificates
routes


30. Security Requirements
30.1 Authentication
Every user must login via central auth
Generated app must use Platform Auth
Generated app cannot store passwords
Generated app cannot create separate users table

30.2 Authorization
Backend permission guard is mandatory
Frontend guard is for UX only
App Store visibility must be permission-based
Every app must have app manifest
Every role/permission change must be audited

30.3 AI Security
Prompt must pass guardrail
Sensitive prompt must be logged
Blocked prompt must notify security
API key must be encrypted
Secret must not be sent to external model if policy forbids
Local-only prompt must use local model/key

30.4 Creator Boundary
Creator cannot:
Access global AI key
Change model provider
Change SSO settings
Disable guardrail
Access other app database
Run raw SQL in production
Open public domain without approval
Change system infrastructure

30.5 Domain Security
Public domain requires approval
DNS ownership must be verified
SSL must be active
Public app must pass security checklist
Public app must have monitoring and audit


31. Monitoring & Audit
31.1 Platform Monitoring
Service health
Container status
CPU/RAM/Disk
PostgreSQL status
Redis status
MinIO status
Keycloak status
AI Gateway status
Build queue
Deployment queue

31.2 Creator Monitoring
Project build status
Preview status
Token remaining
Token usage by project
Frontend version history
Deployment history
Ticket count
Open bugs

31.3 End User Monitoring
App access log
App open count
Ticket submitted
Access request submitted
PWA install status optional

31.4 Audit Events
Login/logout
Failed login
Invite sent
Invite accepted
Role changed
Access requested
Access approved/rejected
Project created
Project remixed
Frontend restored
PRD created
PRD updated
PRD approved
App generated
App deployed
Domain requested
Public domain approved
Model key added/updated
Quota changed
Guardrail changed
Knowledge added/updated
Skill added/updated
Prompt blocked
Ticket submitted
Ticket resolved
Permission denied


32. Non-functional Requirements
32.1 Performance
MVP targets:
Platform page load < 3 seconds
Creator workspace initial load < 5 seconds
AI progress response < 5 seconds
Preview startup < 60 seconds for small app
App Store search < 1 second
Ticket submission < 2 seconds

32.2 Availability
Pilot:
99.0% uptime

Production:
99.5% uptime

32.3 Scalability
Single server pilot target:
50–200 active users
20–50 generated apps
5–20 concurrent preview containers
1,000–10,000 AI requests/month

32.4 Backup
Must backup:
PostgreSQL
MinIO
Git repositories
Keycloak config
Caddy config
Project PRD
App manifest
Knowledge index
Skill registry


33. MVP Implementation Phases
Phase 1: Platform Foundation
Docker Compose installer
PostgreSQL
Keycloak
MinIO
Redis
Caddy
Platform API
Platform Web App
Basic user/group/role
Admin Console

Phase 2: AI Gateway & Guardrail
AI provider management
Multi API key
Scenario routing
Quota
Fallback
Banned keyword
AI policy guardrail
AI usage log

Phase 3: Creator App Core
Project picker
Prompt builder
Live preview
Token remaining
Database view
Frontend version checkpoint
Frontend-only restore
Remix project

Phase 4: Knowledge / Skill / PRD
Knowledge library
Knowledge indexing
Skill library
Agent configuration
Auto PRD generation
PRD versioning
PRD page
PRD export

Phase 5: App Access / App Store / Ticket
App user management
Invite internal/external user
App role assignment
End User App Store PWA
Request access
Support ticket
Ticket routing to Creator

Phase 6: Deployment / Domain
Build sandbox
Production deploy
Internal routing
Domain settings
Public domain approval
Rollback
App Store registration

Phase 7: Enterprise Hardening
SSO integration
Group mapping
Monitoring dashboard
Audit log
Backup
Upgrade
Security checklist
Admin reports


34. Acceptance Criteria
34.1 IT/System Admin Software
System is acceptable when:
Admin can install platform on private server
Admin can run preflight check
Admin can configure domain
Admin can configure SSO
Admin can configure AI provider/API key
Admin can configure guardrail
Admin can view system health
Admin can backup/restore
Admin can upgrade platform

34.2 Creator App
System is acceptable when:
Creator can access through browser
Creator can create project
Creator can prompt AI
Creator can see live preview
Creator can view database table
Creator can remix project
Creator can restore frontend version only
Creator can invite app users
Creator can assign app role
Creator can see token remaining
Creator can publish app if allowed
Creator can view support tickets

34.3 End User App Store PWA
System is acceptable when:
End User can open App Store on mobile/desktop
End User can install PWA
End User sees only accessible apps
End User can request access
End User can open app
End User can submit bug/feedback ticket
End User can track ticket status

34.4 AI Key Management
System is acceptable when:
Admin can add multiple API keys
Admin can set usage mode per key
Admin can route scenario to key/model
Admin can set quota
System can fallback to another key/model
Usage/cost is logged

34.5 Guardrail
System is acceptable when:
Admin can create banned keyword rule
Admin can create AI policy guardrail
System can warn/block/notify
Guardrail events are logged

34.6 PRD Lifecycle
System is acceptable when:
Every project has PRD
AI generates initial PRD
Creator reviews PRD
PRD has versions
Change request updates PRD
Deployment links to PRD version
Ticket can become PRD change request


35. Product Principles
35.1 Three Surface Separation
Admin installs and governs
Creator builds and manages app
End User uses app and gives feedback

35.2 Opinionated Stack
Use one standard stack first:
React + Vite + NestJS + Prisma + PostgreSQL + Keycloak + MinIO + Redis + Docker

35.3 Central Identity, Local App Access
One account, app-specific role/access.
35.4 PRD as Source of Truth
Every project must maintain living PRD.
35.5 Skill + Knowledge as Enterprise Brain
Agent must use organization knowledge and approved skills.
35.6 Creator Safety Boundary
Creator can build app, but cannot change system governance.
35.7 End User Feedback Loop
End users must be able to report issues directly to creator.
35.8 Web-first
Creator and End User must use browser only. End User App Store must be PWA.

36. Final Summary
Enterprise Vibe Coding Platform คือระบบ 3 surfaces สำหรับองค์กร:
IT/System Admin Software
ใช้ติดตั้ง ตั้งค่า SSO, AI Key, Guardrail, Domain, Backup และดูแล platform กลาง
Creator App
Web desktop app สำหรับ Creator ใช้ prompt AI, live preview, ดู database, remix project, restore frontend version, invite users, จัดการ app role และดู token remaining
End User App Store PWA
Progressive Web App สำหรับพนักงานใช้เปิด app ที่มีสิทธิ์ ขอ access และส่ง support ticket / bug / feedback ไปยัง creator
ระบบนี้ทำให้ Business User สร้าง internal app ได้เองแบบ Lovable แต่ทุกอย่างอยู่ภายใต้ governance ขององค์กร ทั้ง Auth, SSO, App Access, AI Key Policy, Token Quota, Guardrail, PRD Lifecycle, Knowledge, Skill, Domain และ Deployment

