# Creator Design-System Unification — Phase 2: Projects Landing controls — Design

**Status:** Approved for implementation (Phase 2 of the program).
**Date:** 2026-07-29
**Branch:** `codex/creator-projects-create-first` (continues Phase 1).

## Program context

Second phase of unifying creator-web onto `@evcp/ui` primitives (Phase 1 rebuilt
the Create Project Wizard). Phases: 1 wizard (done) → **2 projects landing** →
3 PRD page → 4 workspace vibe UI.

## Goal (Phase 2)

Convert the two raw form controls on the projects landing (`ProjectsPage.tsx`) —
the create CTA and the search field — to `@evcp/ui` `Button` and `Input`, so they
match the wizard and the admin console. The `hz-card` project cards, hero text
layout, grid, and empty state are intentionally left as-is (they are already
design-system CSS in `packages/ui` and look good; rebuilding them is out of
scope).

## Background — current state

`ProjectsPage.tsx` (from the Phase-A create-first rework) renders:
- a hero (`hz-hero` with `hz-hero-eyebrow`/`-title`/`-sub`) whose CTA is a raw
  `<button className="hz-prompt-cta" onClick={() => setIsCreateProjectDialogOpen(true)}>`
  containing a `Plus` icon + "สร้าง Project ใหม่";
- a projects section (`hz-projects`) with a search box
  `<div className="hz-search"><Search/><input value={query} … aria-label="ค้นหาโปรเจกต์"/></div>`
  and a `hz-grid` of `hz-card` project cards (unchanged here).

`@evcp/ui` exports `Button({ variant, size })` and `Input(...InputHTMLAttributes)`.

## Components

**`apps/creator-web/src/features/projects/ProjectsPage.tsx`** (only file):

1. Import `Button` and `Input` from `@evcp/ui`.
2. **CTA:** replace the raw `<button className="hz-prompt-cta">…</button>` with
   `<Button variant="primary" onClick={() => setIsCreateProjectDialogOpen(true)}>
   <Plus size={16} aria-hidden="true" /><span>สร้าง Project ใหม่</span></Button>`.
3. **Search:** replace the `<div className="hz-search"><Search/><input/></div>`
   with a bare `<Input value={query} onChange={(e) => setQuery(e.target.value)}
   placeholder="ค้นหาโปรเจกต์…" aria-label="ค้นหาโปรเจกต์" />`. The magnifier
   `Search` icon is dropped (the placeholder conveys intent); drop the now-unused
   `Search` import if nothing else uses it.
4. Keep `hz-hero`, `hz-projects`, `hz-projects-head`, `hz-count`, `hz-grid`,
   `hz-card`, `hz-empty`, and all list/filter logic unchanged.

## Data flow

Unchanged — `query`/`setQuery` filter state and `setIsCreateProjectDialogOpen`
are the same; only the two controls change from raw markup to primitives.

## Error handling

None affected — no new logic.

## Testing

- **Render smoke (`tests/unit/creator-web-render-smoke.test.mjs`):** ProjectsPage
  still renders; the existing assertions for the "สร้าง Project ใหม่" CTA and the
  `aria-label="ค้นหาโปรเจกต์"` search field still pass (now satisfied by `Button`
  and `Input`). Add an assertion that the search field carries the primitive
  `Input` control token (e.g. `focus:ring-primary-soft`) to prove it is the
  primitive, not the raw input.
- **Typecheck** creator-web.
- **Design-system** (`pnpm check:design-system`) — still `packages/ui` only.
- **Visual** — after `docker restart evcp-creator-web`, the CTA and search field
  match the design-system styling (primary button, standard input focus ring).

## Acceptance criteria

- The create CTA is an `@evcp/ui` `Button variant="primary"` and the search field
  is an `@evcp/ui` `Input`.
- The projects list, search filtering, and "สร้าง Project ใหม่" behaviour are
  unchanged.
- `pnpm check` passes; no unused imports (`Search` removed if unused); no file
  exceeds its baseline.

## Out of scope (YAGNI)

- Rebuilding the `hz-card` project cards or the hero text into primitives.
- Restoring a search magnifier icon (bare `Input` is the chosen design).
- Phases 3–4 (PRD page, workspace).
