# Creator Design-System Unification — Phase 3: PRD page — Design

**Status:** Approved for implementation (Phase 3 of the program; presented and
approved inline).
**Date:** 2026-07-29
**Branch:** `codex/creator-design-system-phase-3-prd` (off `main`).

## Program context

Phases: 1 wizard (done, merged) → 2 projects landing (done, merged) → **3 PRD
page** → 4 workspace vibe UI.

## Goal (Phase 3)

`PrdPage.tsx` is already built on `@evcp/ui` primitives (`WorkflowRail`,
`SectionCard`, `DataTable`, `DecisionPanel`). The only remaining raw control is
the **"Confirm Baseline"** `<button>` in the PRD Viewer `SectionCard` action.
Convert it to the `@evcp/ui` `Button` (variant `primary`), so it matches the
wizard, landing, and admin console.

## Components

**`apps/creator-web/src/features/prd/PrdPage.tsx`** (only file):
- Add `Button` to the `@evcp/ui` import.
- Replace the raw action button

  ```tsx
  <button type="button" disabled={!currentPrdVersion || currentPrdVersion.status === "baseline"} onClick={() => { void handleConfirmPrdBaseline(); }}>Confirm Baseline</button>
  ```

  with

  ```tsx
  <Button variant="primary" type="button" disabled={!currentPrdVersion || currentPrdVersion.status === "baseline"} onClick={() => { void handleConfirmPrdBaseline(); }}>Confirm Baseline</Button>
  ```

- Everything else (`WorkflowRail`, `SectionCard`, `DataTable`, `DecisionPanel`,
  the `creator-prd-workbench`/`creator-prd-sections` layout, and all state) is
  unchanged. The `creator-prd-sections` list is structured content inside a
  design-system `SectionCard`, not a control, and stays as-is.

## Data flow / error handling

Unchanged — `handleConfirmPrdBaseline`, `currentPrdVersion`, and the disabled
condition are the same; only the button element changes.

## Testing

- **Render smoke (`tests/unit/creator-web-render-smoke.test.mjs`):** the PRD page
  still renders (it is in `ROUTE_CASES`/`PAGES`); the existing "Confirm Baseline"
  assertion still holds. Add an assertion that the Confirm Baseline control now
  carries a primitive `Button` token.
- **e2e (`tests/e2e/sprint3-creator-prd-smoke.test.mjs`):** already asserts the
  "Confirm Baseline" text is present in creator source — still satisfied. Run the
  **full** unit + integration + e2e suites before pushing (e2e is not in
  `pnpm check`).
- Typecheck; design-system check (all styling in `packages/ui`).

## Acceptance criteria

- The Confirm Baseline control is an `@evcp/ui` `Button variant="primary"`.
- Confirm-baseline behaviour (disabled when no version or already baseline) is
  unchanged.
- `pnpm check` + e2e + integration pass; no file exceeds its baseline.

## Out of scope (YAGNI)

- Rebuilding the `creator-prd-sections` list or the workbench layout.
- Phase 4 (workspace `vibe-live-*`).
