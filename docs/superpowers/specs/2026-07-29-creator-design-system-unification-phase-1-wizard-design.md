# Creator Design-System Unification — Phase 1: Create Project Wizard — Design

**Status:** Approved for implementation (Phase 1 of a multi-phase program).
**Date:** 2026-07-29
**Branch:** `codex/creator-projects-create-first` (stacks on the create-first work,
whose "สร้าง Project ใหม่" CTA is the only trigger that opens this wizard — so the
rework is reachable and visually verifiable on the same branch).

## Program context

The creator-web UI diverges from the admin console: admin-web composes the
`@evcp/ui` primitives (`Button`, `Card`, `Input`, `Field`, `Select`, `Table`, …
— ~23 files), while creator-web mostly uses bespoke raw CSS classes (`hz-*`,
`creator-project-*`, `vibe-live-*`). Both vocabularies live in `packages/ui`, so
`check:design-system` passes, but they look different. The goal is to unify
creator-web onto the `@evcp/ui` primitives. This is too large for one spec, so it
is decomposed into phases, each its own spec → plan → implementation cycle:

1. **Create Project Wizard** (`creator-project-*`) — this spec.
2. Projects landing (hero + cards, `hz-*`).
3. PRD page (`creator-prd-*`).
4. Workspace vibe UI (`vibe-live-*`) — largest.

(Auth screens `creator-auth-*` are already consistent across admin + creator and
are out of scope.)

## Goal (Phase 1)

Rebuild the Create Project Wizard's form so it composes `@evcp/ui` primitives
(`Field` + `Input` + `Textarea` + `Select` + `Button`, inside a `Card`) instead of
the raw `creator-project-*` markup, matching the admin console's look. Establishes
the pattern the later phases follow.

## Background — current state

`apps/creator-web/src/features/projects/CreatorShell.tsx` renders the wizard
(gated by `isCreateProjectDialogOpen`) as a `creator-dialog-backdrop` overlay
containing a `creator-project-dialog` `<form>` with raw `<label><span>…</span>
<input/></label>` fields, a raw `<textarea>`, a native `<select>`, and raw
`ghost-button` / submit buttons. State lives in `createProjectForm` with
`handleCreateProjectField(key, value)` and `handleCreateProjectSubmit`
(unchanged by this phase). `@evcp/ui` already exports `Field({ label, htmlFor?,
hint?, children })`, `Input`, `Select({ value, onChange, children: <option>s })`,
`Button({ variant: primary|secondary|ghost|danger, size })`, and `Card`. There is
**no `Textarea` primitive** yet.

## Components

1. **`packages/ui/src/primitives/textarea.tsx`** (new) — `Textarea(props:
   TextareaHTMLAttributes<HTMLTextAreaElement>)` styled with the same `control`
   token class `Input` uses (so inputs and textareas match). Exported from
   `packages/ui/src/index.tsx` as `Textarea`.

2. **`apps/creator-web/src/features/projects/CreatorShell.tsx`** (wizard section
   only) — replace the raw form markup with primitives, keeping the same state and
   handlers:
   - Each text field → `<Field label="…" htmlFor="…"><Input id="…"
     value={createProjectForm.<key>} onChange={(e) =>
     handleCreateProjectField("<key>", e.target.value)} /></Field>` for `name`,
     `appType`, `targetDepartment`, `intendedUsers`.
   - Business problem → `<Field label="Business problem" htmlFor="…"><Textarea …
     /></Field>`.
   - Data sensitivity → `<Field label="Data sensitivity"><Select
     value={createProjectForm.dataSensitivity} onChange={(e) =>
     handleCreateProjectField("dataSensitivity", e.target.value)}><option
     value="internal">Internal</option><option
     value="confidential">Confidential</option><option
     value="restricted">Restricted</option></Select></Field>`.
   - Buttons → `Close` = `<Button variant="ghost">`, `Cancel` = `<Button
     variant="secondary">`, submit = `<Button variant="primary" type="submit">`.
   - Wrap the form body in `<Card>` (inside the retained `creator-dialog-backdrop`
     overlay) so the panel uses the design-system card surface; the two-column
     grid for fields is kept (reuse `creator-project-form` grid, or a simple
     `@evcp/ui` grid class — no new bespoke CSS).
   - The status/"Ready" box and header eyebrow/title stay as-is for this phase
     (their copy is unchanged; only form controls are converted).

## Data flow

Unchanged. `createProjectForm` state + `handleCreateProjectField` +
`handleCreateProjectSubmit` (→ `createProject` + `generatePrdDraft` → PRD page)
are untouched; only the presentational controls change from raw markup to
primitives.

## Error handling

Unchanged — native form `required` validation and the `createProjectMessage`
status text remain. `Field`'s `hint` may later carry per-field errors, but that
is out of scope here.

## Testing

- **Unit — new `Textarea` primitive:** a focused render test (or extend the
  existing `@evcp/ui` primitive tests if present) asserting `Textarea` renders a
  `<textarea>` with the shared control class and forwards props (value, rows,
  aria-label).
- **Render smoke (`tests/unit/creator-web-render-smoke.test.mjs`):** the wizard
  renders without throwing when `isCreateProjectDialogOpen` is forced true —
  extend the harness to render `CreatorShell`/`ProjectsPage` with the dialog open
  (e.g. a probe that flips the hook's `setIsCreateProjectDialogOpen(true)` via an
  effect, or a direct assertion path), confirming the primitives render.
- **Typecheck** creator-web + `@evcp/ui`.
- **Design-system** (`pnpm check:design-system`) — still all styling in
  `packages/ui`; primitives are compliant.
- **Visual** — verify via Playwright after `docker restart evcp-creator-web`
  (stale-CSS gotcha): the wizard controls match the admin console styling.

## Acceptance criteria

- The Create Project Wizard uses `@evcp/ui` `Field`/`Input`/`Textarea`/`Select`/
  `Button` (+ `Card`), not the raw `creator-project-*` inputs/buttons.
- Creating a project still works end to end (form → PRD draft → PRD page).
- `pnpm check` passes; no file exceeds its baseline; a reusable `Textarea`
  primitive is exported from `@evcp/ui` for later phases.

## Out of scope (YAGNI)

- Phases 2–4 (projects landing, PRD page, workspace) — separate specs.
- Changing the overlay/backdrop mechanism or the wizard's business logic/copy.
- Per-field inline error states (native validation stays).
- Removing the now-unused `creator-project-*` form CSS (leave it until the phase
  that no longer references it; deleting dead CSS is a later cleanup).
