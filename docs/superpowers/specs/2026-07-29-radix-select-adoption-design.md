# Radix UI Adoption — Phase 1: Select — Design

**Status:** Approved for implementation (first of an incremental program).
**Date:** 2026-07-29
**Branch:** `codex/radix-select` (off `main`).

## Program context

Adopt **Radix UI (headless)** under the `@evcp/ui` **stateful** primitives, keeping
the existing `@evcp/ui` API + Tailwind/token styling so no consumer changes. The
simple, non-interactive primitives (`Button`, `Input`, `Textarea`, `Card`,
`Badge`, `Field`, `MetricCard`, `Table`) stay hand-rolled. Program order by a11y
risk: **Select → Tabs → Drawer**, each its own spec/PR. This spec is **Select**.

## Goal (Phase 1)

Replace the internals of `packages/ui/src/primitives/select.tsx` — currently a
hand-rolled listbox (~130 lines managing open state, `activeIndex`, outside-click,
focus restoration, keyboard navigation, and ARIA by hand, with a documented "no
native form validation" gap) — with `@radix-ui/react-select`, while keeping the
**exact same public API and visual style**, so all 15 consumer sites keep
compiling and looking identical but gain robust, battle-tested accessibility
(keyboard nav, typeahead, focus management, positioning/portal, screen-reader
support, and form-`name` submission).

## Background — current state

- `Select` (`SelectProps`): `value`, `onChange: (e: { target: { value: string } })
  => void`, `disabled`, `required`, `className`, `children` (`<option>` elements),
  `id`, `name`, `aria-label`. Children are parsed to `SelectItem[]` via
  `parseSelectOptions` in `select-helpers.ts` (also exports `nextEnabledIndex`,
  `selectedLabel`, `SelectItem`).
- **15 files** consume `<Select value=… onChange={(e) => …e.target.value}>
  <option value=…>…</option></Select>` across admin/creator (e.g.
  `CreateProjectWizard`, `setup-wizard`, AI-governance drawers).
- The primitive currently avoids any headless-ui dependency by design; adopting
  Radix reverses that policy deliberately (the maintainer chose Radix).
- `@evcp/ui` already uses Tailwind v4 + `class-variance-authority` +
  `clsx/tailwind-merge` — the same stack Radix is designed to be styled with.

## Components

1. **`packages/ui/package.json`** — add dependency `@radix-ui/react-select` (a
   version compatible with React 19; the current 2.x line supports it).

2. **`packages/ui/src/primitives/select.tsx`** — rewrite the internals on Radix,
   preserving `SelectProps` exactly:
   - Parse children with the existing `parseSelectOptions(children)` → `SelectItem[]`.
   - Render `<RadixSelect.Root value={value} onValueChange={(v) =>
     onChange?.({ target: { value: v } })} disabled={disabled} required={required}
     name={name}>`.
   - `<RadixSelect.Trigger id={id} aria-label={ariaLabel}
     className={cn(triggerClasses, className)}>` with `<RadixSelect.Value />` and a
     `<RadixSelect.Icon>` (the existing `ChevronDown`). Keep `triggerClasses`
     verbatim so the trigger looks identical.
   - `<RadixSelect.Portal><RadixSelect.Content>` styled with tokens
     (`rounded-control border border-border bg-surface text-body shadow-card
     … z-50`), `<RadixSelect.Viewport>`, and one `<RadixSelect.Item value=…
     disabled=…>` per `SelectItem` (`hover`/`data-highlighted:bg-surface-muted`,
     `data-state=checked` styling) with `<RadixSelect.ItemText>` +
     `<RadixSelect.ItemIndicator>`.
   - Remove the hand-rolled open/`activeIndex`/outside-click/focus/keyboard code.

3. **`packages/ui/src/primitives/select-helpers.ts`** — keep `parseSelectOptions`
   and `SelectItem`; `nextEnabledIndex` and `selectedLabel` become unused (Radix
   owns keyboard nav + the selected label) and are removed to avoid dead code, or
   left if any other file imports them (verify first).

The `@evcp/ui` export of `Select`/`SelectProps` and every call site are unchanged.

## Data flow

Consumer `<Select value onChange={e=>e.target.value}>` → Radix `Root` controlled
by `value`, `onValueChange` → adapted to `{ target: { value } }` → consumer's
existing handler. Options come from parsing the same `<option>` children.

## Error handling

- The old documented gap ("no native form validation / required popup") is
  unchanged in spirit; Radix maps `required` for AT and submits via `name` in a
  form (slightly better than before). Server-side validation, which the drawers
  already surface, remains the source of truth.
- Radix `Content` is portaled — verify it layers correctly inside the existing
  dialogs/drawers (z-index) during visual check.

## Testing

- **Render smoke (`tests/unit/creator-web-render-smoke.test.mjs`) + admin:**
  pages that mount `<Select>` (CreateProjectWizard via the wizard, setup-wizard,
  AI-governance drawers) still render via `renderToStaticMarkup` without throwing.
  Radix `Select.Root`/`Trigger`/`Value` render statically (portaled `Content` only
  mounts on open), so static rendering is safe — confirm, and if any Radix piece
  needs a browser API under SSR, guard it.
- **Unit (`select-helpers`):** existing `parseSelectOptions` tests keep passing.
- **Typecheck** `@evcp/ui` + consumers; **design-system** (`pnpm check:design-system`);
  full unit + e2e + integration suites.
- **Visual** — via a temporary styleguide route (KitchenSink) + `docker restart
  evcp-creator-web`: open the Select, verify it looks identical and keyboard/mouse
  work; verify layering inside a dialog. Revert the temp route before PR.

## Acceptance criteria

- `Select` is backed by `@radix-ui/react-select`; `SelectProps` and all 15 call
  sites are unchanged and compile; the control looks the same.
- Keyboard navigation, typeahead, and focus behave correctly (Radix defaults).
- `pnpm check` + e2e + integration pass; no consumer file changed; design-system
  clean.

## Out of scope (YAGNI)

- Tabs and Drawer (separate Radix phases).
- Changing the `SelectProps` API or the `<option>`-children authoring pattern.
- A multi-select or async/searchable select.
