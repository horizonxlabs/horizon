# Creator Projects — Create-First (Option/Form) Landing — Design

**Status:** Approved for implementation.
**Date:** 2026-07-29
**Branch:** new feature branch off `main`.

## Goal

Rework the creator projects landing (`/creator/projects`, `ProjectsPage.tsx`) so
that creating a project goes through the **option/form "Create Project Wizard"
(which generates a PRD)** instead of the prominent free-text prompt box (which
skips the PRD). This makes every newly created project spec-first, per backlog
E2.2 ("AI-generated PRD draft + Confirm PRD baseline") and E2.4 ("ทุก project มี
PRD").

## Background — current state (the actual problem)

- `ProjectsPage.tsx` leads with a hero **prompt box** ("อธิบายแอปที่ต้องการสร้าง"
  + "สร้างด้วย AI") wired to `handleCreateFromPrompt` — a *prompt-first* flow
  (`use-creator-app.tsx:244`) that `createProject` → straight to workspace →
  `handleVibeChat({ mode: "build" })`. **It never calls `generatePrdDraft`**, so
  these projects have no PRD (Phase A/B2 stay dormant).
- The spec-first path already exists and is fully built but **unreachable**:
  `CreatorShell.tsx` renders a styled **"Create Project Wizard"** overlay
  (`creator-dialog-backdrop` / `creator-project-dialog`) gated by
  `isCreateProjectDialogOpen`, with option fields (name, appType,
  targetDepartment, businessProblem, intendedUsers, dataSensitivity `<select>`:
  Internal/Confidential/Restricted) → `handleCreateProjectSubmit`
  (`use-creator-app.tsx:271`) → `createProject` → **`generatePrdDraft`** →
  navigate to `/creator/projects/:id/prd`. `PrdPage.tsx` already has a **"Confirm
  Baseline"** button (`handleConfirmPrdBaseline`).
- **`setIsCreateProjectDialogOpen(true)` is called nowhere** — the wizard has no
  trigger, so the only way to create a project today is the PRD-skipping prompt
  box.

The fix is therefore small: give the wizard a trigger and remove the prompt-first
hero. Everything downstream (form → PRD draft → review → confirm baseline →
workspace) already works.

## Components

1. **`apps/creator-web/src/features/projects/ProjectsPage.tsx`**
   - Destructure `setIsCreateProjectDialogOpen` from `app` (instead of
     `handleCreateFromPrompt`).
   - **Remove** the prompt hero: the `hz-prompt` `<form>`, the `hz-chips`
     suggestion chips, `PROMPT_SUGGESTIONS`, the `prompt`/`setPrompt` state, and
     `startFromPrompt`. Drop now-unused imports (`WandSparkles`, `ArrowRight`,
     `PROMPT_SUGGESTIONS`).
   - **Add** a create-first header CTA — a prominent "สร้าง Project ใหม่" button
     (an `@evcp/ui` `hz-*` class already used for primary actions) that calls
     `setIsCreateProjectDialogOpen(true)`, with a one-line subtitle explaining the
     wizard generates a PRD. Keep the eyebrow/title area if desired.
   - **Keep** the projects list (`hz-projects`) + search (`query`) below.
   The wizard overlay itself is unchanged (it renders from `CreatorShell` when
   `isCreateProjectDialogOpen` is true).

2. **`apps/creator-web/src/app/use-creator-app.tsx`** — no change required.
   `handleCreateFromPrompt` stays defined/returned (out of scope to delete); it is
   simply no longer wired from `ProjectsPage`. (If oxlint flags it as unused after
   the change, keep it in the hook's return — it is part of the public hook API.)

3. **`packages/ui/styles.css`** — only if the create CTA needs a class that does
   not already exist; reuse an existing primary-action `hz-*` class where
   possible. No app-local styles (design-system rule).

## Data flow

Creator opens `/creator/projects` → clicks **"สร้าง Project ใหม่"** →
`setIsCreateProjectDialogOpen(true)` → Create Project Wizard (option form) →
`handleCreateProjectSubmit` → `createProject` + **`generatePrdDraft`** →
`/creator/projects/:id/prd` → review → **Confirm Baseline** (PRD v1.0) →
workspace. Every project now has a PRD, so Phase A grounds generation and Phase B2
records spec deltas.

## Error handling

- Form validation and failure messaging are unchanged (`createProjectMessage`,
  shown by the existing wizard). A `generatePrdDraft` failure surfaces the existing
  error message; no project is left in a broken create-first state beyond what the
  wizard already handles.

## Testing

- **Render smoke (`tests/unit/creator-web-render-smoke.test.mjs`):** ProjectsPage
  still renders via `renderToStaticMarkup` without throwing after the hero is
  removed. Update any assertion/harness that referenced the prompt input.
- **Assertion (extend smoke or a small render check):** the rendered ProjectsPage
  contains the "สร้าง Project ใหม่" CTA and no longer contains the
  "อธิบายที่ต้องการสร้าง" prompt textarea.
- The wizard → PRD → confirm-baseline flow is unchanged and keeps its existing
  coverage.

## Acceptance criteria

- The projects landing has no free-text "สร้างด้วย AI" prompt box; creating a
  project is done through the option/form wizard.
- Clicking the create CTA opens the existing Create Project Wizard, and completing
  it produces a project **with a PRD draft** (reaching the PRD page for baseline
  confirmation).
- The projects list + search remain functional.
- `pnpm check` passes (design-system: no app-local styles; render-smoke green);
  no file exceeds its baseline.

## Out of scope (YAGNI)

- A multi-step wizard (the existing single-form wizard is reused).
- Redesigning the projects list itself (cards stay).
- Deleting `handleCreateFromPrompt` from the hook (only its ProjectsPage wiring is
  removed).
- Auto-confirming the PRD baseline (the Creator confirms it on the PRD page, per
  governance).
