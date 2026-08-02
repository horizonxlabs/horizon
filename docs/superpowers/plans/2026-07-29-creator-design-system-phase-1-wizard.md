# Creator Design-System Unification — Phase 1 (Wizard) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Create Project Wizard form with `@evcp/ui` primitives (`Field`/`Input`/`Textarea`/`Select`/`Button`) so it matches the admin console, adding a reusable `Textarea` primitive.

**Architecture:** Add a `Textarea` primitive to `@evcp/ui`. Extract the wizard from `CreatorShell.tsx` into a presentational `CreateProjectWizard` component that takes plain props (so it is directly render-testable) and composes primitives; `CreatorShell` renders it when the dialog is open. State and handlers stay in the hook.

**Tech Stack:** React + Vite (creator-web), `@evcp/ui` primitives (Tailwind design-system tokens), lucide-react. Tests: Node built-in runner via `node --import tsx --test` with `renderToStaticMarkup`.

## Global Constraints

- No app-local stylesheets/inline styles/hardcoded colors — all styling via `@evcp/ui` primitives/tokens (enforced by `pnpm check:design-system`).
- Keep the wizard's state + handlers unchanged: `createProjectForm` (keys: `name`, `appType`, `targetDepartment`, `businessProblem`, `intendedUsers`, `dataSensitivity`), `handleCreateProjectField(key, value)`, `handleCreateProjectSubmit(event)`.
- Keep the existing `creator-dialog-backdrop` overlay + `creator-project-dialog` panel layout (design-system CSS in `packages/ui`); only the controls become primitives. Keep the already-primitive `Select` and `DecisionPanel`.
- `pnpm check` passes; no file exceeds its baseline.

Reference — the shared control token class (from `packages/ui/src/primitives/input.tsx`); `Input` uses `h-10 … px-3 py-0` (fixed height). A textarea must instead grow, so it uses `min-h-24 … px-3 py-2 resize-y` with the same border/radius/bg/focus tokens.

---

### Task 1: Add a `Textarea` primitive to `@evcp/ui`

**Files:**
- Create: `packages/ui/src/primitives/textarea.tsx`
- Modify: `packages/ui/src/index.tsx` (export)
- Test: `tests/unit/ui-textarea.test.mjs`

**Interfaces:**
- Produces: `Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>)` exported from `@evcp/ui`, rendering a `<textarea>` with the shared design-system control styling.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui-textarea.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Textarea } from "../../packages/ui/src/index.tsx";

test("Textarea renders a textarea with the shared control tokens and forwards props", () => {
  const html = renderToStaticMarkup(
    React.createElement(Textarea, { value: "hi", onChange: () => {}, rows: 4, "aria-label": "notes" })
  );
  assert.match(html, /<textarea/);
  assert.match(html, /aria-label="notes"/);
  assert.match(html, /rows="4"/);
  assert.match(html, /border-border/);
  assert.match(html, /focus:ring-primary-soft/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/ui-textarea.test.mjs`
Expected: FAIL — `Textarea` is not exported from `@evcp/ui`.

- [ ] **Step 3: Write the primitive**

Create `packages/ui/src/primitives/textarea.tsx`:

```tsx
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

// Same border/radius/surface/focus tokens as Input's control, but sized for multi-line growth:
// min-height + real vertical padding + vertical resize (Input uses a fixed h-10 with py-0).
const control =
  "min-h-24 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft resize-y";

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, className)} {...rest} />;
}
```

In `packages/ui/src/index.tsx`, add to the `Input, Field` export line's neighborhood:

```ts
export { Input, Field } from "./primitives/input";
export { Textarea } from "./primitives/textarea";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/ui-textarea.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/primitives/textarea.tsx packages/ui/src/index.tsx tests/unit/ui-textarea.test.mjs
git commit -m "feat(ui): add a Textarea primitive to @evcp/ui

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extract `CreateProjectWizard` on primitives; render it from `CreatorShell`

**Files:**
- Create: `apps/creator-web/src/features/projects/CreateProjectWizard.tsx`
- Modify: `apps/creator-web/src/features/projects/CreatorShell.tsx`
- Test: `tests/unit/creator-web-create-project-wizard.test.mjs`

**Interfaces:**
- Consumes: `@evcp/ui` `Field`, `Input`, `Textarea` (Task 1), `Select`, `Button`, `DecisionPanel`.
- Produces: `CreateProjectWizard(props)` where
  `props = { form: { name: string; appType: string; targetDepartment: string; businessProblem: string; intendedUsers: string; dataSensitivity: string }; onField: (key: string, value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void; message: string; isCreating: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/creator-web-create-project-wizard.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
const { CreateProjectWizard } = await import(
  "../../apps/creator-web/src/features/projects/CreateProjectWizard.tsx"
);

const form = { name: "", appType: "Workflow App", targetDepartment: "", businessProblem: "", intendedUsers: "", dataSensitivity: "internal" };

test("CreateProjectWizard renders primitive controls (Field/Input/Textarea/Button) without throwing", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreateProjectWizard, {
      form, onField: () => {}, onSubmit: () => {}, onClose: () => {}, message: "Ready", isCreating: false
    })
  );
  assert.match(html, /Create Project \+ Generate PRD/);
  assert.match(html, /<textarea/);
  // primitive Input/Textarea carry the design-system focus token, not the legacy raw input
  assert.match(html, /focus:ring-primary-soft/);
  assert.match(html, /Project name/);
  assert.match(html, /Data sensitivity/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/creator-web-create-project-wizard.test.mjs`
Expected: FAIL — the module/component does not exist yet.

- [ ] **Step 3: Create the component**

Create `apps/creator-web/src/features/projects/CreateProjectWizard.tsx`:

```tsx
import { WandSparkles } from "lucide-react";
import type { FormEvent } from "react";
import { Button, DecisionPanel, Field, Input, Select, Textarea } from "@evcp/ui";

export interface CreateProjectWizardForm {
  name: string;
  appType: string;
  targetDepartment: string;
  businessProblem: string;
  intendedUsers: string;
  dataSensitivity: string;
}

export function CreateProjectWizard({
  form,
  onField,
  onSubmit,
  onClose,
  message,
  isCreating
}: {
  form: CreateProjectWizardForm;
  onField: (key: string, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  message: string;
  isCreating: boolean;
}) {
  return (
    <div className="creator-dialog-backdrop" role="presentation">
      <form className="creator-project-dialog" onSubmit={onSubmit} aria-label="Create project wizard">
        <header>
          <div>
            <span className="eyebrow">Create Project Wizard</span>
            <h2>สร้าง Project ใหม่</h2>
            <p>ระบบจะสร้าง project, เรียก governed AI route และสร้าง PRD draft แรกให้ทันที</p>
          </div>
          <Button variant="ghost" type="button" onClick={onClose} disabled={isCreating}>
            Close
          </Button>
        </header>
        <div className="creator-project-form">
          <Field label="Project name" htmlFor="cpw-name">
            <Input
              id="cpw-name"
              required
              value={form.name}
              onChange={(event) => onField("name", event.target.value)}
            />
          </Field>
          <Field label="App type" htmlFor="cpw-app-type">
            <Input
              id="cpw-app-type"
              value={form.appType}
              onChange={(event) => onField("appType", event.target.value)}
            />
          </Field>
          <Field label="Target department" htmlFor="cpw-dept">
            <Input
              id="cpw-dept"
              value={form.targetDepartment}
              onChange={(event) => onField("targetDepartment", event.target.value)}
            />
          </Field>
          <div className="creator-project-form-wide">
            <Field label="Business problem" htmlFor="cpw-problem">
              <Textarea
                id="cpw-problem"
                required
                rows={4}
                value={form.businessProblem}
                onChange={(event) => onField("businessProblem", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Intended users" htmlFor="cpw-users">
            <Input
              id="cpw-users"
              value={form.intendedUsers}
              onChange={(event) => onField("intendedUsers", event.target.value)}
            />
          </Field>
          <Field label="Data sensitivity" htmlFor="cpw-sensitivity">
            <Select
              id="cpw-sensitivity"
              value={form.dataSensitivity}
              onChange={(event) => onField("dataSensitivity", event.target.value)}
            >
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
              <option value="public">Public</option>
            </Select>
          </Field>
        </div>
        <DecisionPanel
          tone={message.includes("failed") ? "danger" : "info"}
          badge={isCreating ? "Creating" : "Ready"}
          title={message}
          lines={[
            "POST /projects",
            "POST /projects/{projectId}/prd/generate",
            "Refresh project list and select the new project"
          ]}
        />
        <footer>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isCreating}>
            <WandSparkles size={16} />
            {isCreating ? "Creating Project" : "Create Project + Generate PRD"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `CreatorShell.tsx`**

In `apps/creator-web/src/features/projects/CreatorShell.tsx`:

1. Replace the imports on line 1–2 so the shell no longer needs `WandSparkles`/`Select` directly and imports the new component:

```tsx
import { AppShell, PageHeader } from "@evcp/ui";
import type { ReactNode } from "react";
import { HorizonLogo } from "@/shared/HorizonLogo";
import { CreateProjectWizard } from "./CreateProjectWizard";
import type { useCreatorApp } from "@/app/use-creator-app";
```

2. Replace the entire `{isCreateProjectDialogOpen ? ( … ) : null}` block (lines 58–165) with:

```tsx
      {isCreateProjectDialogOpen ? (
        <CreateProjectWizard
          form={createProjectForm}
          onField={handleCreateProjectField}
          onSubmit={handleCreateProjectSubmit}
          onClose={() => setIsCreateProjectDialogOpen(false)}
          message={createProjectMessage}
          isCreating={isCreatingProject}
        />
      ) : null}
```

The destructure (lines 14–30) already pulls every value the wizard needs; leave it. `DecisionPanel` and `Select` are no longer used directly by `CreatorShell`, so they are dropped from its import (done in sub-step 1).

- [ ] **Step 5: Run tests + typecheck**

Run:
```bash
node --import tsx --test tests/unit/creator-web-create-project-wizard.test.mjs tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck && pnpm --filter @evcp/ui typecheck
```
Expected: all PASS; typecheck clean (the wizard props line up with the hook values passed by `CreatorShell`).

- [ ] **Step 6: Commit**

```bash
git add apps/creator-web/src/features/projects/CreateProjectWizard.tsx apps/creator-web/src/features/projects/CreatorShell.tsx tests/unit/creator-web-create-project-wizard.test.mjs
git commit -m "feat: rebuild the Create Project Wizard on @evcp/ui primitives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full gate + visual verify

**Files:** none (verification only).

- [ ] **Step 1: Run the quality gate**

Run: `pnpm check`
Expected: design-system (all styling in `packages/ui`), oxlint (no unused imports — `WandSparkles`/`Select`/`DecisionPanel` removed from `CreatorShell`), typecheck, and unit tests pass. (Known pre-existing/flaky: `POST /setup/initialize …`; confirm no *new* failures.)

- [ ] **Step 2: Visual verify (against the docker stack)**

Run: `docker restart evcp-creator-web` (the stale-CSS gotcha — Vite in the container does not pick up file changes on macOS), wait for `VITE … ready`, then open `/creator/projects`, click "สร้าง Project ใหม่", and confirm the wizard's inputs/textarea/buttons now use the design-system styling (rounded controls, primary/secondary/ghost buttons, focus ring) matching the admin console.

- [ ] **Step 3: Commit any gate fixups** (only if the gate required a change)

```bash
git add -A
git commit -m "chore: satisfy quality gate for wizard design-system rebuild"
```

---

## Self-Review

**Spec coverage:**
- New `Textarea` primitive exported from `@evcp/ui` → Task 1.
- Wizard rebuilt with `Field`/`Input`/`Textarea`/`Select`/`Button` (+ retained `DecisionPanel`, overlay) → Task 2.
- State/handlers unchanged (`createProjectForm`/`handleCreateProjectField`/`handleCreateProjectSubmit`) → Task 2 wiring passes them through as props.
- Testing: Textarea render (Task 1), wizard renders primitives with the dialog forced open via direct component render (Task 2), render-smoke still green, design-system + typecheck (Tasks 2–3), visual (Task 3).
- No app-local styles; overlay/`creator-project-*` layout retained → Global Constraints + Task 2.

**Placeholder scan:** none — full component and tests are concrete.

**Type consistency:** `CreateProjectWizardForm` keys (`name`, `appType`, `targetDepartment`, `businessProblem`, `intendedUsers`, `dataSensitivity`) match `createProjectForm`; `onField: (key: string, value: string) => void` matches `handleCreateProjectField`; `onSubmit`/`onClose`/`message`/`isCreating` map to `handleCreateProjectSubmit`/`setIsCreateProjectDialogOpen(false)`/`createProjectMessage`/`isCreatingProject`. `Textarea` (Task 1) is imported and used in Task 2.
