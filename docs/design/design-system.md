# EVCP Design System

ระบบกลางสำหรับงาน UI ของ Enterprise Vibe Coding Platform ทุก surface: Admin, Creator และ App Store PWA

## Direction

- Tone: professional, quiet, data-dense, enterprise-grade
- Language: user-facing copy ใช้ภาษาไทยเป็นหลัก ยกเว้น technical noun ที่ทีมใช้จริง เช่น Provider, API Key, Guardrail, Route
- Layout: หน้าปฏิบัติงานต้องเริ่มด้วย task surface ทันที ไม่ทำ landing page
- Density: ใช้ card เฉพาะ repeated item, panel, modal หรือ framed tool เท่านั้น
- Radius: card/control ใช้ 8px เพื่อให้ดูเป็น enterprise tool ไม่ใช่ marketing page

## Tokens

Tokens อยู่ใน [packages/ui/styles.css](/Users/artizno/0xlabs/EnterpriseVibeCodingPlatform/packages/ui/styles.css)

| Category | Token | Usage |
| --- | --- | --- |
| Brand | `--evcp-color-primary`, `--evcp-color-primary-strong` | primary actions, admin shell, page header |
| Surface | `--evcp-color-page`, `--evcp-color-surface`, `--evcp-color-surface-muted` | page background, cards, table headers |
| Border | `--evcp-color-border`, `--evcp-color-border-soft` | card borders, row dividers, framed tools |
| Text | `--evcp-color-text`, `--evcp-color-muted` | body copy, secondary labels, captions |
| Status | success/warning/danger/info token pairs | badges, status pills, warning rails |
| Spacing | `--evcp-space-1` through `--evcp-space-7` | component gaps and padding |
| Shape | `--evcp-radius-control`, `--evcp-radius-card`, `--evcp-radius-pill` | controls, cards, status pills |
| Elevation | `--evcp-shadow-card` | important panels only |

## Components

Exports อยู่ใน [packages/ui/src/index.tsx](/Users/artizno/0xlabs/EnterpriseVibeCodingPlatform/packages/ui/src/index.tsx)

| Component | Use When | Notes |
| --- | --- | --- |
| `AppShell` | Shared app chrome with sidebar/topbar | ใช้กับ Admin และ Creator web |
| `PageHeader` | Screen-level title and primary actions | `tone="primary"` สำหรับ operational command center, `surface` สำหรับ quieter screens |
| `MetricCard` | KPI summary | ส่ง `icon`, `tone`, `detail` ได้ |
| `SectionCard` | A bounded tool section | มี eyebrow/title/action slot |
| `DataTable` | Small to medium operational data table | Supports tone badge per column |
| `DefinitionGrid` | Label/value metadata | ใช้กับ detail panels เช่น key fingerprint |
| `DecisionPanel` | Result, validation, policy decision | ใช้ tone ให้ตรง severity |
| `WorkflowRail` | Left-side process/context rail | ใช้กับ flows ที่มี state sequence |
| `ServiceStrip` | Compact service readiness list | เหมาะกับท้าย dashboard/health summary |
| `ToneBadge` / `StatusPill` | Status and semantic labels | success, warning, danger, neutral, info |

## Patterns

### Admin / Governance

- ใช้ `PageHeader` + `MetricCard` เพื่อสรุป state ล่าสุด
- ใช้ `WorkflowRail` เมื่อหน้ามี process/context ที่ต้องเห็นตลอด
- ใช้ `SectionCard` + `DataTable` สำหรับ provider, route, quota, guardrail และ event log
- ใช้ `admin-monitoring-shell` สำหรับ MVP Monitoring ที่ต้องรวม Service Health, Ticket Counts, Domain Requests และ Audit Filters ในหน้าเดียว
- ใช้ `auth-policy-shell` สำหรับ Auth/SSO production readiness ที่ต้องแสดง provider registry, role mapping, Platform Auth session evidence, break-glass และ policy templates ใน context เดียวกัน
- ใช้ `runtime-hardening-shell` สำหรับ generated app runtime evidence ที่ต้องแสดง container contract, schema isolation, health/readiness, structured logs, metrics, OpenAPI และ migration dry-run ใน context เดียวกัน
- ใช้ `knowledge-skill-governance-shell` สำหรับ governance dashboard ที่ต้องแสดง Knowledge Library, Version Approval, Scoped Retrieval, Skill Library, Skill Versioning, Skill Assignment และ Workspace Context ใน context เดียวกัน
- ใช้ `scope-filter-bar` สำหรับ filter ชุด actor/project/app/department/agent/scenario ใน retrieval simulator และ workflow governance tools
- ใช้ `governance-mobile-list` แทน dense tables บน mobile โดยต้องคง label/status text และไม่ truncate audit/version identifiers
- ห้ามแสดง plaintext secret; ใช้ masked value หรือ fingerprint เท่านั้น

### Creator

- ใช้ `PageHeader tone="surface"` เพื่อไม่แข่งกับ canvas/live preview
- ใช้ `SectionCard` สำหรับ Project Picker, Create Project Wizard, PRD Viewer, database schema, version/remix controls
- ใช้ `WorkflowRail` สำหรับ flow ที่ต้องเห็นลำดับชัด เช่น project input -> governed generation -> draft -> baseline
- ใช้ `DecisionPanel` สำหรับ PRD governance readiness, baseline immutability, publish readiness, validation และ failed generation
- ใช้ `DataTable` สำหรับ PRD Version History, frontend checkpoints และ restore history
- ใช้ workspace layout แบบ data-dense สำหรับ Prompt Composer, Task Progress, Live Preview, Token Remaining และ Usage Log โดยไม่ซ่อน guardrail/token state ออกจากหน้าหลัก
- ใช้ database/restore layout แบบ split view: table rail + schema/sample/migration detail + checkpoint side panel พร้อม boundary copy ว่า restore กระทบเฉพาะ frontend
- ใช้ app users/publish layout แบบ split operational view: users/members/invites/access requests/roles เป็น main panel และ manifest/readiness/deployment เป็น side panel เพื่อให้ publish decision เห็น access state ใน context เดียวกัน
- ใช้ `sprint8-shell` สำหรับ feedback/domain hardening ที่ต้องเห็น Ticket-to-PRD, PRD Change Requests, Domain Settings, Deployment Traceability และ MVP Demo Checklist ใน context เดียวกัน

### App Store PWA

- ใช้ `MetricCard` อย่างประหยัด เพราะ mobile surface แคบ
- ใช้ `SectionCard` สำหรับ app detail, request access, feedback, bug report และ ticket status
- ใช้ `StatusPill` สำหรับ app health และ access status
- ใช้ `store-status-strip` สำหรับ summary ที่ต้อง scan ได้ใน mobile เช่น My Apps, SSO, Offline
- ใช้ `ticket-timeline` สำหรับ ticket submitted/in review/planned/resolved state โดยต้องมี badge text ไม่พึ่งสีอย่างเดียว
- ใช้ Creator `creator-ticket-inbox-shell` เมื่อ feedback จาก End User ต้องถูกแปลงเป็น PRD change หรือ AI prompt ต่อ

## Accessibility

- Buttons must have visible text or familiar icon plus accessible label.
- Tables must keep header cells in `thead`.
- Status cannot rely on color alone; badge text must describe state.
- Focusable controls must remain native `button`, `a`, `input`, or equivalent semantic elements.
- Mobile breakpoint must collapse multi-column grids to one column at `760px`.

## Contribution Rules

- New UI in sprint work should first reuse `@evcp/ui`.
- Add a new primitive only when at least two surfaces or sprint screens can reuse it.
- New hardcoded color, spacing, radius, or shadow should become a token first.
- New primitive must include CSS class under `ds-*`, props in `packages/ui/src/index.tsx`, and a test in `tests/unit/ui-design-system.test.mjs`.

## Component Library Decision

EVCP uses `@evcp/ui` as the product design system and component library. The project should not adopt a large opinionated visual framework as the main UI layer because Admin, Creator and App Store need one enterprise product language.

Allowed supporting libraries for future work:

| Library Type | Preferred Choice | Use For |
| --- | --- | --- |
| Icons | `lucide-react` | Action and status icons inside buttons, cards and dashboards |
| Headless accessibility primitives | Radix UI or equivalent | Dialog, dropdown, tooltip, select, popover, tabs when native controls are not enough |
| Complex tables | TanStack Table or equivalent | Sorting, filtering, pagination and column state for large enterprise tables |
| Forms and validation | React Hook Form + Zod or equivalent | Provider config, domain requests, guardrail policy and invite forms |

Visual styling remains owned by `@evcp/ui` tokens, CSS and reusable primitives.

Decision for Sprint 9 onward: use `@evcp/ui` as the internal component library, add Radix/shadcn-style headless primitives only where interaction complexity requires them, and keep enterprise visual styling in EVCP tokens rather than adopting a large opinionated dashboard framework. Sprint 10 confirms this approach for runtime dashboards: use EVCP shells, metrics, tables, definition grids and decision panels instead of importing a large visual UI framework. Sprint 11 extends the same approach for knowledge/skill governance with `knowledge-skill-governance-shell`, `scope-filter-bar` and `governance-mobile-list`.
