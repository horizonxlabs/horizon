# Creator Design-System Unification — Phase 4: Workspace controls — Design

**Status:** Approved for implementation (final phase of the program).
**Date:** 2026-07-29
**Branch:** new feature branch off `main`.

## Program context

Final phase of unifying creator-web onto `@evcp/ui` primitives. Phases: 1 wizard,
2 projects landing, 3 PRD page (all merged) → **4 workspace vibe-coding UI**.

## Goal (Phase 4)

Convert the **raw controls** in the workspace vibe-coding UI (5 files, ~1194
lines, currently zero `@evcp/ui` usage) to `@evcp/ui` primitives — the
Preview/Code/Database tab bar to the `Tabs` primitive, every `<button>` to
`Button`, and the prompt `<textarea>` to `Textarea` — so the workspace matches the
wizard, landing, PRD page, and admin console. Purpose-built UI (the chat thread,
`vibe-message` bubbles, streaming markdown, preview iframe, code tree, database
data-grid, and layout shells) stays bespoke — those are not generic components.

Shipped as **one spec, a multi-task plan (4a–4d), and one PR**, because it is a
uniform mechanical transformation across the files.

## Background — current state

- `WorkspacePage.tsx` (388 lines): a `vibe-live-shell` with a header
  (`vibe-live-header`) containing a back `<a>` link, a `vibe-live-tabs`
  `role="tablist"` of `<button>`s (Preview/Code/Database), a refresh icon button,
  a preview `<a>` link, and a publish `<button>`; a chat thread
  (`vibe-live-thread`, `vibe-message*`); a preview iframe; and a prompt bar with a
  `vibe-live-input` `<textarea>`, a Plan/Build mode toggle (`MODE_OPTIONS`
  `<button>`s), suggestion `<button>`s, and a `vibe-live-send` `<button>`.
- `WorkspaceCodePanel.tsx` (303) and `WorkspaceDatabasePanel.tsx` (273): the Code
  and Database tab bodies with `hz-code-*`/`hz-tree-row` and `hz-db-*` controls
  (buttons) plus a react-data-grid.
- `VibeActionRow.tsx` / `VibeReasoning.tsx`: chat sub-components with an occasional
  `<button>`.
- `@evcp/ui` exports `Tabs<T>({ items: TabItem[], active, onSelect })`, `Button({
  variant, size })`, `Textarea`.

## Components (plan tasks)

**4a — `WorkspacePage.tsx` header + tabs:**
- Replace the `vibe-live-tabs` tablist with
  `<Tabs items={[{ id: "preview", label: "Preview" }, { id: "code", label:
  "Code" }, { id: "database", label: "Database" }]} active={vibeTab}
  onSelect={setVibeTab} />`.
- Refresh + publish controls → `Button` (refresh = `variant="ghost"` icon;
  publish = `variant="primary"`, keeping its `disabled` when plan mode). The back
  and preview `<a>` links stay `<a>` (they are navigation, not buttons).

**4b — `WorkspacePage.tsx` prompt bar:**
- `vibe-live-input` `<textarea>` → `Textarea` (same value/onChange/placeholder/
  disabled/keydown handlers).
- Plan/Build `MODE_OPTIONS` toggle → each option a `Button` with
  `variant={mode === value ? "primary" : "secondary"}` (active/inactive), same
  onClick.
- Suggestion `<button>`s and the `vibe-live-send` send `<button>` → `Button`.

**4c — `WorkspaceCodePanel.tsx`:** its `<button>` controls → `Button`; the file
tree, code view, and `hz-code-*` layout stay.

**4d — `WorkspaceDatabasePanel.tsx`:** its `<button>` controls → `Button`; the
react-data-grid and `hz-db-*` layout stay.

Plus any stray `<button>` in `VibeActionRow`/`VibeReasoning` → `Button`.

## Data flow / error handling

Unchanged — all state, refs, effects, streaming, onClick/disabled/keydown
handlers stay; only the control elements change from raw markup to primitives.

## Testing

- **Render smoke (`tests/unit/creator-web-render-smoke.test.mjs`):** `WorkspacePage`
  is already rendered (`PAGES`/`ROUTE_CASES`). Add assertions that the tab bar and
  key controls now carry primitive tokens (e.g. the tabs and send/publish buttons
  render classed `Button`/`Tabs`, not raw `vibe-live-tab`/`vibe-live-send`
  elements). Code/Database panels render without throwing.
- **Typecheck**; **design-system** (`pnpm check:design-system` — all styling in
  `packages/ui`).
- Run the **full** unit + e2e + integration suites before pushing (e2e is not in
  `pnpm check`); confirm no stale source-surface assertions break (the sprint
  smoke tests read creator source).
- **Visual** — after `docker restart evcp-creator-web`, the workspace header,
  tabs, mode toggle, prompt, and panel buttons match the design system.

## Acceptance criteria

- The workspace tab bar is the `@evcp/ui` `Tabs` primitive; every workspace
  `<button>` is a `Button`; the prompt input is a `Textarea`.
- All workspace behaviour (mode switch, send, refresh, publish, tab switch, code/
  database panels) is unchanged.
- `pnpm check` + e2e + integration pass; `WorkspacePage.tsx` stays ≤ 400 lines; no
  file exceeds its baseline.

## Out of scope (YAGNI)

- Rebuilding the chat thread / `vibe-message` bubbles / streaming markdown /
  preview iframe / code tree / data-grid — these stay bespoke.
- Changing streaming, auto-scroll, or preview-authorization logic.
- A segmented-control primitive (the Plan/Build toggle uses `Button` variants).
