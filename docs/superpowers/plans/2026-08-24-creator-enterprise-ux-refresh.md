# Creator Portal Enterprise UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a consistent, English-only, responsive enterprise UX across every authenticated Creator Portal route without changing existing business behavior.

**Architecture:** Add a small Creator-specific presentation layer for shared asynchronous states and status messages, extend only the generic UI primitives that need reusable semantics, and migrate pages in dependency order. Existing hooks remain responsible for data and mutations; pages map hook output into semantic presentation states and readable English copy.

**Tech Stack:** React 19, TypeScript 7, Tailwind CSS 4, shared `@evcp/ui` primitives, Lucide React, Node test runner with `tsx`, Vite 8.

**Spec:** `docs/superpowers/specs/2026-08-24-creator-enterprise-ux-refresh-design.md`

## Global Constraints

- Preserve existing routes, API contracts, authentication, permissions, project selection, publishing, deployment, and deletion behavior.
- Use English for all user-facing copy on authenticated Creator management routes.
- Keep LINE Seed Sans TH as the font family; use page titles at 24–28px, section titles at 16–18px, body/table content at 14–16px, navigation at 14px, captions at 12–13px, and metric values near 24px.
- Reserve primary blue for active navigation and the most important positive action; use red for destructive and reject actions.
- Touch targets must be at least 44px high on narrow/touch layouts.
- Every asynchronous page must distinguish loading, ready-with-data, ready-empty, unavailable, and error states.
- Raw service errors may appear only as optional technical details behind a user-centered leading message.
- Do not introduce new sprint-numbered layout classes or CSS selectors tied to localized ARIA-label text.
- Scope shared CSS carefully so Admin and Store surfaces do not change unintentionally.
- Preserve all existing dirty-worktree changes; stage and commit only the files named by the task being completed.
- The repository currently has a known stale assertion in `tests/unit/creator-workspace-vibe-cursor.test.mjs`; fix it only if the implementation changes the asserted Workspace contract, otherwise report it separately during final verification.

---

### Task 1: Shared Creator State and Action Foundation

**Files:**

- Create: `apps/creator-web/src/shared/CreatorState.tsx`
- Create: `apps/creator-web/src/shared/CreatorStatusMessage.tsx`
- Create: `apps/creator-web/src/shared/index.ts`
- Modify: `packages/ui/src/primitives/button.tsx`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/styles.css`
- Create: `tests/unit/creator-enterprise-ux.test.mjs`

**Interfaces:**

- Produces: `CreatorState({ kind, title, description, action, technicalDetails })`, where `kind` is `"loading" | "empty" | "unavailable" | "error"` and `action` is optional `ReactNode`.
- Produces: `CreatorStatusMessage({ tone, children, technicalDetails })`, where `tone` is `"info" | "success" | "warning" | "danger"`.
- Produces: `Button` variant `dangerOutline` alongside the existing `primary`, `secondary`, `ghost`, and `danger` variants.
- Extends: `DataTable` with optional `ariaLabel?: string` and `emptyMessage?: ReactNode` while preserving its existing generic row/column API.

- [ ] **Step 1: Write the failing shared-foundation tests**

Add static-render coverage that proves the new semantic components, table accessibility, and danger-outline action exist:

```js
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { CreatorState, CreatorStatusMessage } =
  await import("../../apps/creator-web/src/shared/index.ts");
const { Button, DataTable } = await import("../../packages/ui/src/index.tsx");

test("CreatorState renders a recoverable error with optional technical details", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorState, {
      kind: "error",
      title: "Versions could not be loaded",
      description: "Your existing checkpoints are unchanged.",
      action: React.createElement("button", null, "Retry"),
      technicalDetails: "HTTP 503"
    })
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /Versions could not be loaded/);
  assert.match(html, /Technical details/);
  assert.match(html, /Retry/);
});

test("CreatorStatusMessage maps danger feedback to alert semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorStatusMessage, { tone: "danger" }, "Publish failed")
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /creator-status-message-danger/);
});

test("DataTable exposes a labeled scroll region and contextual empty state", () => {
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      ariaLabel: "Project members",
      columns: [{ key: "name", label: "Name" }],
      rows: [],
      emptyMessage: "No members have access yet."
    })
  );
  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Project members"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /No members have access yet/);
});

test("Button supports a danger-outline action hierarchy", () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { variant: "dangerOutline" }, "Reject")
  );
  assert.match(html, /text-danger/);
  assert.match(html, /border-danger/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-enterprise-ux.test.mjs
```

Expected: FAIL because `apps/creator-web/src/shared/index.ts` and the new component exports do not exist.

- [ ] **Step 3: Implement the shared state components**

Create focused components with icons, live-region semantics, actions, and optional disclosure. The core structure must be:

```tsx
import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle, WifiOff } from "lucide-react";

export type CreatorStateKind = "loading" | "empty" | "unavailable" | "error";

const iconByKind: Record<CreatorStateKind, ReactNode> = {
  loading: <LoaderCircle className="creator-state-spinner" />,
  empty: <Inbox />,
  unavailable: <WifiOff />,
  error: <AlertCircle />
};

export function CreatorState({
  kind,
  title,
  description,
  action,
  technicalDetails
}: {
  kind: CreatorStateKind;
  title: string;
  description?: string;
  action?: ReactNode;
  technicalDetails?: string;
}) {
  return (
    <div
      className={`creator-state creator-state-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <span className="creator-state-icon" aria-hidden="true">
        {iconByKind[kind]}
      </span>
      <div className="creator-state-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {action ? <div className="creator-state-action">{action}</div> : null}
        {technicalDetails ? (
          <details>
            <summary>Technical details</summary>
            <pre>{technicalDetails}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
```

`CreatorStatusMessage` must use `role="alert"` only for `danger`, `role="status"` otherwise, and render technical details through the same disclosure pattern. Export both components from `apps/creator-web/src/shared/index.ts`.

- [ ] **Step 4: Extend Button and DataTable without breaking callers**

Add the button variant:

```ts
dangerOutline: "border border-danger bg-surface text-danger hover:bg-danger-bg focus-visible:ring-danger-bg";
```

Extend `DataTable` props and wrapper:

```tsx
<div className="table-wrap ds-table-wrap" role="region" aria-label={ariaLabel} tabIndex={0}>
  <table className="ds-data-table">...</table>
  {rows.length === 0 && emptyMessage ? (
    <div className="ds-data-table-empty">{emptyMessage}</div>
  ) : null}
</div>
```

Render the table header even when empty so column meaning remains available. Add scoped styles for Creator states, table overflow cues, sticky headers, and 44px mobile buttons. Do not alter existing Admin/Store card colors.

- [ ] **Step 5: Run focused tests, typecheck, and changed-file checks**

Run:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-enterprise-ux.test.mjs tests/unit/ui-tailwind-source.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm check:changed
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add apps/creator-web/src/shared/CreatorState.tsx apps/creator-web/src/shared/CreatorStatusMessage.tsx apps/creator-web/src/shared/index.ts packages/ui/src/primitives/button.tsx packages/ui/src/index.tsx packages/ui/styles.css tests/unit/creator-enterprise-ux.test.mjs
git commit -m "feat: add creator enterprise state foundation"
```

---

### Task 2: Creator Shell, Navigation, and English Page Copy

**Files:**

- Modify: `packages/ui/src/app-shell.tsx`
- Modify: `packages/ui/styles.css`
- Modify: `apps/creator-web/src/features/projects/CreatorShell.tsx`
- Modify: `apps/creator-web/src/app/routes.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `tests/unit/creator-enterprise-ux.test.mjs`
- Modify: `tests/unit/creator-web-routing.test.mjs`

**Interfaces:**

- Consumes: semantic design tokens and action hierarchy from Task 1.
- Produces: stable `.app-shell-brand` and `.app-shell-sidebar-toggle` hooks that replace CSS tied to ARIA-label text.
- Produces: English `creatorPageCopy` for every authenticated Creator route.

- [ ] **Step 1: Add failing shell and copy contract tests**

```js
const shellSource = await readFile("packages/ui/src/app-shell.tsx", "utf8");
const routesSource = await readFile("apps/creator-web/src/app/routes.ts", "utf8");

test("Creator shell styling uses semantic hooks instead of translated aria labels", () => {
  assert.match(shellSource, /app-shell-brand/);
  assert.match(shellSource, /app-shell-sidebar-toggle/);
  assert.doesNotMatch(
    await readFile("packages/ui/styles.css", "utf8"),
    /button\[aria-label="(?:Collapse|Expand) sidebar"\]/
  );
});

test("authenticated Creator page copy is English", () => {
  assert.doesNotMatch(routesSource, /[\u0E00-\u0E7F]/);
  assert.match(routesSource, /Review schema, tables, and records/);
  assert.match(routesSource, /Manage project-level settings/);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run the Task 1 test command. Expected: FAIL on missing semantic shell classes and Thai copy in `routes.ts`.

- [ ] **Step 3: Add stable shell classes and normalize sizing**

Apply `.app-shell-brand` to the brand header container and `.app-shell-sidebar-toggle` to the collapse control. Replace the current CSS selectors with:

```css
@media (min-width: 769px) {
  .app-shell-brand:has(.creator-sidebar-logo) {
    justify-content: center;
    position: relative;
  }

  .app-shell-brand:has(.creator-sidebar-logo) .app-shell-sidebar-toggle {
    position: absolute;
    right: 4px;
  }

  .app-shell-collapsed .app-shell-brand .app-shell-sidebar-toggle {
    position: static;
  }
}
```

Change navigation text to 14px and keep the collapsed control at least 44px square. Retain accessible English ARIA labels and mobile focus restoration.

- [ ] **Step 4: Replace authenticated route copy with concise English**

Use these page titles and descriptions:

```ts
project: { title: "Project: Leave Management", description: "Review project status, key information, and common actions." },
workspace: { title: "Creator Workspace: Leave Management", description: "Build and refine the application through guided AI changes." },
prd: { title: "PRD Review: Leave Management", description: "Review requirements, version history, and the confirmed product baseline." },
database: { title: "Database", description: "Review project schema, tables, and records." },
versions: { title: "Frontend Versions", description: "Review checkpoints and restore the frontend without changing backend data." },
users: { title: "Users & Roles", description: "Manage members, invitations, access requests, and role permissions." },
publish: { title: "Publish & Registry", description: "Review readiness and register the application for end users." },
deployments: { title: "Deployments", description: "Review deployment environments, versions, health, and timestamps." },
tickets: { title: "Tickets & Changes", description: "Turn Store feedback into tracked product changes." },
settings: { title: "Project Settings", description: "Manage project information and permanent deletion." }
```

Remove redundant eyebrows in `CreatorShell` by passing them only when they add context distinct from the title.
Translate the provisioning overlay to `Preparing workspace` and `Starting this project's sandbox. This may take a moment.` without changing its blocking behavior.

- [ ] **Step 5: Run routing, contract, typecheck, and build checks**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-enterprise-ux.test.mjs tests/unit/creator-web-routing.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
```

Expected: PASS; the build may still print existing font asset resolution warnings but must exit 0.

- [ ] **Step 6: Commit shell and copy**

```bash
git add packages/ui/src/app-shell.tsx packages/ui/styles.css apps/creator-web/src/features/projects/CreatorShell.tsx apps/creator-web/src/app/routes.ts packages/config/src/index.ts tests/unit/creator-enterprise-ux.test.mjs tests/unit/creator-web-routing.test.mjs
git commit -m "feat: refine creator shell and English copy"
```

---

### Task 3: Projects, Project Dashboard, and Settings

**Files:**

- Modify: `apps/creator-web/src/features/projects/ProjectsPage.tsx`
- Modify: `apps/creator-web/src/features/projects/ProjectSwitcher.tsx`
- Modify: `apps/creator-web/src/features/projects/CreateProjectWizard.tsx`
- Modify: `apps/creator-web/src/features/project-overview/ProjectOverviewPage.tsx`
- Modify: `apps/creator-web/src/features/project-settings/ProjectSettingsPage.tsx`
- Modify: `apps/creator-web/src/features/project-settings/use-project-deletion.ts`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`
- Modify: `tests/unit/project-settings.test.mjs`
- Modify: `tests/unit/creator-enterprise-ux.test.mjs`

**Interfaces:**

- Consumes: `CreatorState`, semantic buttons, English page copy, and stable shell styles.
- Produces: readable status formatter `formatProjectStatus(status: string): string` local to project presentation.
- Preserves: default-most-recent project selection and exact-name deletion validation.

- [ ] **Step 1: Add failing render expectations**

```js
test("Projects landing uses concise English copy and project metadata", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));
  assert.match(html, /Create your next internal application/);
  assert.match(html, /Create project/);
  assert.match(html, /Created/);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("Project dashboard has one project heading and a balanced overview grid", () => {
  const html = renderWithHook((app) => React.createElement(ProjectOverviewPage, { app }));
  assert.match(html, /creator-project-overview-grid/);
  assert.match(html, /Project information/);
  assert.match(html, /Quick actions/);
  assert.doesNotMatch(html, />Project overview</);
});
```

Update deletion tests to require English confirmation and `Button variant="danger"`.

- [ ] **Step 2: Run focused tests and verify they fail**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs tests/unit/project-settings.test.mjs tests/unit/creator-enterprise-ux.test.mjs
```

Expected: FAIL on old Thai Projects copy, repeated overview labels, and current Settings presentation.

- [ ] **Step 3: Refresh the Projects landing**

Replace the hero copy with:

```tsx
<h1 className="hz-hero-title">Create your next internal application</h1>
<p className="hz-hero-sub">
  Start with a business need. Horizon will prepare a PRD draft for review before development begins.
</p>
```

Use a restrained six-tone class palette based on surface and blue/slate tints, remove text shadow and backdrop blur, and render metadata as application type, owner, readable status, and formatted created date. Use `CreatorState` for search-empty and no-project states. Reduce hero spacing so the project list appears earlier.

Translate the project switcher and creation wizard completely. Use `Select project`, `Create project`, `Project name`, `Application type`, `Business problem`, `Cancel`, and `Create project` as the primary labels. Preserve field names, validation, submission, and the absence of an All Projects option.

- [ ] **Step 4: Consolidate the Project Dashboard**

Replace three `MetricCard` elements with one compact `.creator-project-summary` definition/list row. Use one full-width grid:

```tsx
<div className="creator-project-overview-grid">
  <SectionCard title="Project information">...</SectionCard>
  <SectionCard title="Quick actions">...</SectionCard>
</div>
```

Set CSS to `grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr)` and collapse below 900px. Keep Workspace primary; Database and Publish secondary. Format the created date with `Intl.DateTimeFormat("en", { dateStyle: "medium" })`.

- [ ] **Step 5: Refine Settings and deletion feedback**

Use a neutral Project information card and a `.creator-danger-zone` section. Keep exact-name validation, render deletion failures through `CreatorStatusMessage tone="danger"`, and use the existing danger button. Replace fallback copy with `Unable to delete this project. Your project remains unchanged.` while retaining the raw error as technical details.

- [ ] **Step 6: Run focused verification and commit**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs tests/unit/project-settings.test.mjs tests/unit/creator-enterprise-ux.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm check:changed
git add apps/creator-web/src/features/projects/ProjectsPage.tsx apps/creator-web/src/features/projects/ProjectSwitcher.tsx apps/creator-web/src/features/projects/CreateProjectWizard.tsx apps/creator-web/src/features/project-overview/ProjectOverviewPage.tsx apps/creator-web/src/features/project-settings/ProjectSettingsPage.tsx apps/creator-web/src/features/project-settings/use-project-deletion.ts packages/ui/styles.css tests/unit/creator-web-render-smoke.test.mjs tests/unit/project-settings.test.mjs tests/unit/creator-enterprise-ux.test.mjs
git commit -m "feat: refresh creator project surfaces"
```

Expected: tests, typecheck, and changed-file checks PASS before commit.

---

### Task 4: Versions, Deployments, Tickets, and PRD States

**Files:**

- Modify: `apps/creator-web/src/features/versions/VersionsPage.tsx`
- Modify: `apps/creator-web/src/features/versions/use-frontend-versions.ts`
- Modify: `apps/creator-web/src/features/deployments/DeploymentsPage.tsx`
- Modify: `apps/creator-web/src/features/tickets/TicketsPage.tsx`
- Modify: `apps/creator-web/src/features/tickets/TicketDetailPage.tsx`
- Modify: `apps/creator-web/src/features/tickets/use-creator-ticket-inbox.ts`
- Modify: `apps/creator-web/src/features/prd/PrdPage.tsx`
- Modify: `apps/creator-web/src/app/use-creator-prd.ts`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`
- Modify: `tests/unit/creator-enterprise-ux.test.mjs`

**Interfaces:**

- Consumes: shared state and status components.
- Produces: a single visible state per async capability instead of a raw message plus duplicate warning.
- Preserves: restore checkpoint, deployment display, ticket actions, and PRD generation/baseline flows.

- [ ] **Step 1: Add failing single-state and English-copy tests**

```js
test("Versions renders one actionable unavailable state", () => {
  const source = await readFile("apps/creator-web/src/features/versions/VersionsPage.tsx", "utf8");
  assert.match(source, /CreatorState/);
  assert.doesNotMatch(source, /DecisionPanel/);
  assert.match(source, /Checkpoints could not be loaded/);
});

test("Tickets distinguish a healthy empty inbox from service unavailability", () => {
  const source = await readFile("apps/creator-web/src/features/tickets/TicketsPage.tsx", "utf8");
  assert.match(source, /No tickets yet/);
  assert.match(source, /Ticket service is unavailable/);
  assert.match(source, /Retry/);
});
```

Add source assertions that these touched page and hook files contain no Thai code points.

- [ ] **Step 2: Run focused tests and verify they fail**

Run the render-smoke and enterprise UX test files. Expected: FAIL on missing shared states and existing technical copy.

- [ ] **Step 3: Consolidate Versions and PRD states**

For Versions, branch explicitly:

```tsx
{
  versions.status === "loading" ? (
    <CreatorState kind="loading" title="Loading checkpoints" />
  ) : null;
}
{
  versions.status === "error" ? (
    <CreatorState
      kind="unavailable"
      title="Checkpoints could not be loaded"
      description="Existing frontend versions are unchanged."
      action={
        <Button variant="secondary" onClick={() => void versions.refresh()}>
          Retry
        </Button>
      }
      technicalDetails={versions.message}
    />
  ) : null;
}
```

Render the list only when ready. Format dates with English `Intl.DateTimeFormat`, map status to `Current`/`Available`, and keep Restore secondary. Apply the same single-state rule to PRD loading/unavailable/generation feedback while preserving its existing actions.

- [ ] **Step 4: Consolidate Deployments and Tickets states**

When deployment data is absent, show one `CreatorState kind="empty"` titled `No deployments yet` with a `Go to Publish` action that uses `creatorPathForPage(project.id, "publish")`. For Tickets, show `No tickets yet` only when status is ready and the list is empty; show `Ticket service is unavailable` plus Retry when status is error. Ticket detail must use the same unavailable state and retain supported actions.

- [ ] **Step 5: Run verification and commit**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-enterprise-ux.test.mjs tests/unit/creator-ticket-actions.test.mjs tests/unit/creator-app-api-state.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm check:changed
git add apps/creator-web/src/features/versions apps/creator-web/src/features/deployments/DeploymentsPage.tsx apps/creator-web/src/features/tickets apps/creator-web/src/features/prd/PrdPage.tsx apps/creator-web/src/app/use-creator-prd.ts packages/ui/styles.css tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-enterprise-ux.test.mjs
git commit -m "feat: unify creator lifecycle states"
```

Expected: PASS.

---

### Task 5: Users & Roles Responsive Access Management

**Files:**

- Modify: `apps/creator-web/src/features/users/UsersPage.tsx`
- Modify: `apps/creator-web/src/features/publish/use-publish-access.ts`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/creator-user-invitations.test.mjs`
- Modify: `tests/unit/creator-access-actions.test.mjs`
- Modify: `tests/unit/creator-enterprise-ux.test.mjs`

**Interfaces:**

- Consumes: `DataTable` accessibility/empty-state props, `CreatorStatusMessage`, and `Button dangerOutline`.
- Preserves: invitation drawer, invite payload, access decision mutation, pending-state disabling, and role data.

- [ ] **Step 1: Write failing access-management tests**

```js
test("access decisions use distinct action semantics", () => {
  const html = renderUsersWithPendingRequest();
  assert.match(html, />Approve</);
  assert.match(html, /border-danger/);
  assert.match(html, />Reject</);
  assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
});

test("each access table has a contextual empty message", async () => {
  const source = await readFile("apps/creator-web/src/features/users/UsersPage.tsx", "utf8");
  assert.match(source, /No members have access yet/);
  assert.match(source, /No invitations are pending/);
  assert.match(source, /No access requests are waiting for review/);
  assert.match(source, /No application roles are available/);
});
```

- [ ] **Step 2: Run Users tests and verify they fail**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-user-invitations.test.mjs tests/unit/creator-access-actions.test.mjs tests/unit/creator-enterprise-ux.test.mjs
```

Expected: FAIL on raw buttons, missing empty states, and technical feedback.

- [ ] **Step 3: Normalize invitation and table copy**

Use English field labels and helper text throughout. Pass `ariaLabel` and `emptyMessage` to all four tables. Convert internal permission strings with:

```ts
function formatPermission(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
```

Render permissions as `.creator-permission-list` chips without changing stored values.

- [ ] **Step 4: Make access decisions semantic and mobile-safe**

Replace raw action buttons with:

```tsx
<div className="creator-access-actions">
  <Button
    size="sm"
    disabled={!isPending || isDeciding}
    onClick={() => handleAccessRequestDecision(request.id, "approved")}
  >
    Approve
  </Button>
  <Button
    size="sm"
    variant="dangerOutline"
    disabled={!isPending || isDeciding}
    onClick={() => handleAccessRequestDecision(request.id, "rejected")}
  >
    Reject
  </Button>
</div>
```

Use `CreatorStatusMessage` for access feedback. On narrow screens, keep the action group at a minimum 44px control height and allow it to wrap; the table overflow region remains keyboard-focusable.

- [ ] **Step 5: Rewrite hook feedback without changing control flow**

Replace technical leading messages with outcome-focused English such as `Access information could not be loaded. Retry to view the latest members and requests.` Keep the original error message available to the page as technical detail only if the current hook shape permits it without an API change.

- [ ] **Step 6: Verify and commit**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-user-invitations.test.mjs tests/unit/creator-access-actions.test.mjs tests/unit/creator-enterprise-ux.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm check:changed
git add apps/creator-web/src/features/users/UsersPage.tsx apps/creator-web/src/features/publish/use-publish-access.ts packages/ui/styles.css tests/unit/creator-user-invitations.test.mjs tests/unit/creator-access-actions.test.mjs tests/unit/creator-enterprise-ux.test.mjs
git commit -m "feat: improve creator access management ux"
```

Expected: PASS.

---

### Task 6: Publish Readiness and Registry Hierarchy

**Files:**

- Modify: `apps/creator-web/src/features/publish/PublishPage.tsx`
- Modify: `apps/creator-web/src/features/publish/PublishDialog.tsx`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`
- Modify: `tests/unit/creator-enterprise-ux.test.mjs`

**Interfaces:**

- Consumes: shared Creator states/status and semantic buttons.
- Produces: five-step readiness sequence for Manifest, Route, Permissions, Preview, and Registry.
- Preserves: `handlePublishProject`, `publishReview`, `publishResult`, deployment dialog behavior, and publish gating.

- [ ] **Step 1: Add failing readiness tests**

```js
test("Publish presents five readable readiness stages and blocking reasons", async () => {
  const source = await readFile("apps/creator-web/src/features/publish/PublishPage.tsx", "utf8");
  for (const label of ["Manifest", "Route", "Permissions", "Preview", "Registry"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /creator-readiness-list/);
  assert.doesNotMatch(source, /No manifest returned|API required|No registry entry returned/);
});
```

- [ ] **Step 2: Run Publish tests and verify they fail**

Run render-smoke and enterprise UX tests. Expected: FAIL on the current flat definition/checklist layout and technical copy.

- [ ] **Step 3: Build the readiness sequence**

Derive presentation-only steps inside `PublishPage`:

```ts
const readinessSteps = [
  {
    label: "Manifest",
    ready: Boolean(manifestVersion),
    detail: manifestVersion ? `Version ${manifestVersion}` : "Manifest has not been generated."
  },
  { label: "Route", ready: Boolean(route), detail: route || "Application route is unavailable." },
  {
    label: "Permissions",
    ready: permissionsReady,
    detail: permissionsReady
      ? "Access configuration is ready."
      : "Resolve access requirements before publishing."
  },
  {
    label: "Preview",
    ready: Boolean(visiblePreview),
    detail: visiblePreview ? "Preview is available." : "Generate a preview before publishing."
  },
  {
    label: "Registry",
    ready: Boolean(visibleRegistryEntry),
    detail: visibleRegistryEntry
      ? "Registry entry is available."
      : "The entry will be created during publish."
  }
];
```

Render an ordered `.creator-readiness-list` with icon plus text, not color alone. Show the Publish button as primary only when `publishReview?.ready` is true. When disabled, render a nearby `CreatorStatusMessage tone="warning"` summarizing blockers.

- [ ] **Step 4: Normalize dialog and result copy**

Replace raw errors with `CreatorStatusMessage tone="danger"` and expandable technical details. Use `Publishing…`, `Deploying…`, and `Promoting…` progress labels. Preserve request functions and disabled-state logic.

- [ ] **Step 5: Verify and commit**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-enterprise-ux.test.mjs tests/unit/publish-service.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm check:changed
git add apps/creator-web/src/features/publish/PublishPage.tsx apps/creator-web/src/features/publish/PublishDialog.tsx packages/ui/styles.css tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-enterprise-ux.test.mjs
git commit -m "feat: clarify creator publish readiness"
```

Expected: PASS.

---

### Task 7: Database Readability and Responsive Data Grid

**Files:**

- Modify: `apps/creator-web/src/features/database/DatabasePage.tsx`
- Modify: `apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx`
- Create: `apps/creator-web/src/features/workspace/format-database-value.tsx`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`
- Create: `tests/unit/creator-database-presentation.test.mjs`

**Interfaces:**

- Consumes: shared Creator states and full-width page layout.
- Produces: `formatDatabaseValue(value: unknown): ReactNode`, which returns readable booleans, null markers, English dates, objects, and plain scalar text without interpreting strings as CSS classes.
- Preserves: schema loading, row loading, add/edit/delete row operations, and `react-data-grid` behavior.

- [ ] **Step 1: Write failing value-format and responsive-state tests**

```js
import { formatDatabaseValue } from "../../apps/creator-web/src/features/workspace/format-database-value.tsx";

test("database values render semantic content instead of raw utility classes", () => {
  assert.equal(formatDatabaseValue(null), "Not set");
  assert.equal(formatDatabaseValue(true), "Yes");
  assert.equal(formatDatabaseValue(false), "No");
  assert.equal(formatDatabaseValue("flex gap-4"), "flex gap-4");
});

test("database panel declares all recoverable presentation states", async () => {
  const source = await readFile(
    "apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx",
    "utf8"
  );
  for (const text of [
    "Loading database schema",
    "No tables yet",
    "No records yet",
    "Database could not be loaded",
    "Write failed"
  ]) {
    assert.match(source, new RegExp(text));
  }
});
```

- [ ] **Step 2: Run database tests and verify they fail**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-database-presentation.test.mjs tests/unit/creator-web-render-smoke.test.mjs
```

Expected: FAIL because the formatter and semantic state copy do not exist.

- [ ] **Step 3: Implement safe value formatting**

Use exact rules:

```tsx
export function formatDatabaseValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en").format(value);
  if (typeof value === "object") return <code>{JSON.stringify(value)}</code>;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text) : undefined;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : text;
}
```

Use the formatter in display-only cells. Inputs continue using raw values so edit behavior is unchanged.

- [ ] **Step 4: Add semantic states and responsive layout**

Make `DatabasePage` use a full-width card without repeated `Database: project-name` wording. Replace inline error bars and plain empty strings with `CreatorState` or `CreatorStatusMessage`. At widths below 760px, set `.hz-db` to one column, render `.hz-db-tables` as a horizontal selectable strip, keep `.hz-db-scroll` focusable, and preserve sticky table headers.

- [ ] **Step 5: Verify and commit**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-database-presentation.test.mjs tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
pnpm check:changed
git add apps/creator-web/src/features/database/DatabasePage.tsx apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx apps/creator-web/src/features/workspace/format-database-value.tsx packages/ui/styles.css tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-database-presentation.test.mjs
git commit -m "feat: improve creator database presentation"
```

Expected: PASS.

---

### Task 8: Workspace Information Hierarchy and Narrow-Screen Panels

**Files:**

- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx`
- Modify: `apps/creator-web/src/features/workspace/VibeActionSummary.tsx`
- Modify: `apps/creator-web/src/features/workspace/VibeActionRow.tsx`
- Modify: `apps/creator-web/src/features/workspace/VibeReasoning.tsx`
- Modify: `apps/creator-web/src/features/workspace/QuickMessages.tsx`
- Modify: `apps/creator-web/src/features/workspace/workspace-chrome.ts`
- Modify: `apps/creator-web/src/features/workspace/use-vibe-chat.ts`
- Modify: `packages/ui/styles.css`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`
- Modify: `tests/unit/creator-workspace-navigation-contract.test.mjs`
- Modify: `tests/unit/creator-auto-agent-ui.test.mjs`
- Modify: `tests/unit/creator-workspace-vibe-cursor.test.mjs` only if its asserted cursor contract is stale after the new hierarchy.

**Interfaces:**

- Consumes: semantic status components, English copy, responsive tokens, and the database changes from Task 7.
- Produces: `WorkspaceView = "conversation" | "preview" | "code" | "database"` for narrow-screen panel selection.
- Preserves: prompt streaming, stop control, question blocks, quick-message prompt values, preview authorization, publish dialog, restore points, code/database tabs, and diagnostic detail.

- [ ] **Step 1: Add failing Workspace hierarchy tests**

```js
test("Workspace exposes explicit narrow-screen panel navigation", async () => {
  const source = await readFile(
    "apps/creator-web/src/features/workspace/WorkspacePage.tsx",
    "utf8"
  );
  assert.match(source, /WorkspaceView/);
  for (const label of ["Conversation", "Preview", "Code", "Database"]) {
    assert.match(source, new RegExp(label));
  }
});

test("completed technical activity is collapsed by default", async () => {
  const actionSource = await readFile(
    "apps/creator-web/src/features/workspace/VibeActionSummary.tsx",
    "utf8"
  );
  const reasoningSource = await readFile(
    "apps/creator-web/src/features/workspace/VibeReasoning.tsx",
    "utf8"
  );
  assert.match(actionSource, /<details/);
  assert.match(reasoningSource, /<details/);
  assert.doesNotMatch(actionSource, /<details[^>]*open/);
});

test("Workspace user-facing status labels are English and outcome focused", async () => {
  const source = await readFile("apps/creator-web/src/features/workspace/use-vibe-chat.ts", "utf8");
  for (const label of ["Working", "Waiting for input", "Completed", "Stopped", "Failed"]) {
    assert.match(source, new RegExp(label));
  }
});
```

- [ ] **Step 2: Run Workspace tests and verify they fail**

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-workspace-navigation-contract.test.mjs tests/unit/creator-auto-agent-ui.test.mjs tests/unit/creator-workspace-vibe-cursor.test.mjs tests/unit/creator-enterprise-ux.test.mjs
```

Expected: FAIL on missing panel navigation and always-expanded technical output. Record the exact cursor-test failure before changing its assertion.

- [ ] **Step 3: Collapse completed technical detail without hiding active work**

Wrap completed action collections and reasoning in closed `<details>` blocks with clear summaries such as `3 completed technical actions` and `View implementation reasoning`. Keep the current streaming action and active reasoning expanded so users can see progress. Do not remove diffs, commands, errors, restore points, or line counts.

```tsx
<details className="vibe-technical-details" open={isStreaming || undefined}>
  <summary>{isStreaming ? "Working" : `${actions.length} completed technical actions`}</summary>
  <div className="vibe-technical-details-body">...</div>
</details>
```

- [ ] **Step 4: Add structured outcome and progress hierarchy**

Keep the latest user request and current response visually prominent. Add semantic status copy in `use-vibe-chat.ts`: `Working`, `Waiting for input`, `Completed`, `Stopped`, and `Failed`. Older completed turns receive `.vibe-turn-compact`; active turns receive `.vibe-turn-current`. Preserve message text and assistant suggestions.

Translate every visible Workspace control, tab, placeholder, quick-message label, empty state, and dialog trigger into English. Keep prompt payloads semantically equivalent; only the displayed language changes. `workspace-chrome.ts` must expose `Preview`, `PRD`, `Code`, and `Database`, and the composer must use `Describe the change you want to make` as its accessible placeholder.

- [ ] **Step 5: Add narrow-screen panel switching**

Define:

```ts
type WorkspaceView = "conversation" | "preview" | "code" | "database";
const [mobileView, setMobileView] = useState<WorkspaceView>("conversation");
```

Render an accessible `.workspace-mobile-switcher` with four `Button variant="ghost"` controls, `aria-pressed`, and exact labels Conversation, Preview, Code, Database. Below 900px, show only the selected panel; desktop retains the split view. Selecting an existing desktop tab updates `mobileView` without changing tab data behavior.

- [ ] **Step 6: Prevent clipped quick messages and respect reduced motion**

Make quick messages wrap on medium widths and use a focusable horizontal scroll strip on very narrow widths with `scroll-snap-type: x proximity`. Add visible end padding and a text label so horizontal content is discoverable. Add `@media (prefers-reduced-motion: reduce)` rules that remove progress transforms and panel animation while keeping content visible.

- [ ] **Step 7: Reconcile the cursor contract, then verify and commit**

If `creator-workspace-vibe-cursor.test.mjs` still asserts the pre-existing expression while `WorkspacePage` intentionally uses `(message.text || !message.reasoning)`, update the test to assert the actual streaming rule and add one negative case for completed turns. Do not weaken the assertion to a generic substring.

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-workspace-navigation-contract.test.mjs tests/unit/creator-auto-agent-ui.test.mjs tests/unit/creator-workspace-vibe-cursor.test.mjs tests/unit/creator-enterprise-ux.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
pnpm check:changed
git add apps/creator-web/src/features/workspace packages/ui/styles.css tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-workspace-navigation-contract.test.mjs tests/unit/creator-auto-agent-ui.test.mjs tests/unit/creator-workspace-vibe-cursor.test.mjs tests/unit/creator-enterprise-ux.test.mjs
git commit -m "feat: simplify creator workspace hierarchy"
```

Expected: all focused tests, typecheck, build, and changed-file checks PASS.

---

### Task 9: Full English Audit, Browser Review, and Release Verification

**Files:**

- Modify only files identified by the audit commands below.
- Modify: `tests/unit/creator-enterprise-ux.test.mjs` for final route coverage if gaps are found.
- Modify: `scripts/quality/large-file-baseline.json` only if a legitimate test-file line increase triggers the repository’s existing large-file gate and splitting the test would reduce clarity.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: a verified Creator Portal with no known in-scope visual, copy, responsive, or accessibility regressions.

- [ ] **Step 1: Scan authenticated Creator UI for remaining Thai and technical copy**

```bash
rg -n '[ก-๙]' apps/creator-web/src/app apps/creator-web/src/features packages/config/src/index.ts
rg -n 'No .*returned|API required|Platform API unavailable|\berror\b|not set|preview pending' apps/creator-web/src/features apps/creator-web/src/app
rg -n 'sprint[0-9]+-(shell|main-panel)|button\[aria-label="(?:Collapse|Expand) sidebar"\]' apps/creator-web/src packages/ui/styles.css
```

Expected: no Thai user-facing copy in authenticated Creator routes; technical terms may remain only in comments, raw-data adapters, or expandable technical details. No touched Creator page uses sprint-numbered layout classes or ARIA-label CSS selectors.

- [ ] **Step 2: Add a final source audit test**

Add an explicit authenticated-route file list to `creator-enterprise-ux.test.mjs` and assert no Thai code points in those files. Exclude authentication/setup files per the approved spec. Assert every table-heavy page uses either `DataTable ariaLabel` or a focusable named overflow region.

```js
const authenticatedCreatorFiles = [
  "apps/creator-web/src/app/routes.ts",
  "apps/creator-web/src/features/projects/CreatorShell.tsx",
  "apps/creator-web/src/features/projects/ProjectSwitcher.tsx",
  "apps/creator-web/src/features/projects/CreateProjectWizard.tsx",
  "apps/creator-web/src/features/projects/ProjectsPage.tsx",
  "apps/creator-web/src/features/project-overview/ProjectOverviewPage.tsx",
  "apps/creator-web/src/features/workspace/WorkspacePage.tsx",
  "apps/creator-web/src/features/workspace/QuickMessages.tsx",
  "apps/creator-web/src/features/workspace/workspace-chrome.ts",
  "apps/creator-web/src/features/prd/PrdPage.tsx",
  "apps/creator-web/src/features/database/DatabasePage.tsx",
  "apps/creator-web/src/features/versions/VersionsPage.tsx",
  "apps/creator-web/src/features/users/UsersPage.tsx",
  "apps/creator-web/src/features/publish/PublishPage.tsx",
  "apps/creator-web/src/features/deployments/DeploymentsPage.tsx",
  "apps/creator-web/src/features/tickets/TicketsPage.tsx",
  "apps/creator-web/src/features/tickets/TicketDetailPage.tsx",
  "apps/creator-web/src/features/project-settings/ProjectSettingsPage.tsx"
];
for (const file of authenticatedCreatorFiles) {
  assert.doesNotMatch(await readFile(file, "utf8"), /[\u0E00-\u0E7F]/, file);
}
```

- [ ] **Step 3: Run complete automated verification**

```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
pnpm check:changed
git diff --check
```

Expected: every command exits 0. If the stale cursor test fails, return to Task 8 and correct the precise contract; do not commit or push with a failing required suite.

- [ ] **Step 4: Review every Creator route in the authenticated browser**

Use project `prj_14af05ae2e3044aa87014ad5ddf8ee42` and inspect:

```text
/creator/
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/project
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/prd
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/database
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/versions
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/users
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/publish
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/deployments
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/tickets
/creator/projects/prj_14af05ae2e3044aa87014ad5ddf8ee42/settings
```

At desktop and narrow widths verify: no horizontal page clipping, readable hierarchy, visible table actions, one state message per failure, 44px narrow controls, keyboard focus order, visible focus, sidebar collapse, project switching, quick-message reachability, Workspace panel switching, and exact-name deletion validation. Check representative text/status/action contrast against WCAG 2.1 AA.

- [ ] **Step 5: Fix only evidence-backed review findings and re-run affected checks**

For each finding, add or strengthen a regression assertion first, reproduce the failure, apply the smallest correction, then run its focused test plus typecheck. Avoid unrelated visual refactoring during this pass.

- [ ] **Step 6: Commit final audit corrections**

```bash
git add apps/creator-web/src packages/ui packages/config/src/index.ts tests/unit scripts/quality/large-file-baseline.json
git diff --cached --check
git commit -m "fix: complete creator ux accessibility audit"
```

Skip this commit if Step 5 required no file changes.

- [ ] **Step 7: Run final branch verification and prepare handoff**

```bash
pnpm test
pnpm typecheck
pnpm --filter @evcp/creator-web build
pnpm check:changed
git status --short
git log --oneline -10
```

Expected: required commands PASS, the worktree contains no unintended files, and commits are ready for push to `main` only after the user’s existing push request is reconfirmed or remains clearly active.
