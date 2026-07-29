# Radix UI Adoption — Phase 2: Tabs — Design

**Status:** Approved for implementation.
**Date:** 2026-07-29
**Branch:** `codex/radix-tabs` (off `main`).

## Program context

Second phase of adopting Radix UI under the `@evcp/ui` stateful primitives (phase
1, `Select`, is in PR #167). This phase gives `Tabs` real keyboard navigation.

## Goal (Phase 2)

Give the `@evcp/ui` `Tabs` primitive proper keyboard support (arrow keys to move
between tabs, Home/End, roving `tabindex`) by wrapping it in
`@radix-ui/react-roving-focus`, while keeping the exact `Tabs` API, ARIA roles,
and styling so its 3 consumers are unchanged.

## Why RovingFocus (not `@radix-ui/react-tabs`)

`@evcp/ui`'s `Tabs` is **list-only**: `Tabs<T>({ items: {id,label}[], active,
onSelect, "aria-label"? })` renders only the `role="tablist"` bar; all 3 consumers
(`AiProvidersConsole`, `KnowledgeSkillsConsole`, `WorkspacePage`) render their
panels **separately**, driven by `active`. `@radix-ui/react-tabs` is content-
coupled (`Root > List > Trigger` **+ `Content`**); using it without `Content`
leaves each trigger's `aria-controls` pointing at a panel that isn't there — a
real a11y defect — and changes activation semantics. `@radix-ui/react-roving-focus`
is precisely the primitive for "a focusable list with arrow-key navigation" and
imposes no content coupling, so it fits the decoupled tab bar cleanly.

Current gap: `Tabs` buttons have `role="tab"`/`aria-selected` but only `onClick` —
no arrow-key movement and no roving tabindex (all tabs are Tab-stops), which is
incorrect for a WAI-ARIA tablist.

## Components

1. **`packages/ui/package.json`** — add `@radix-ui/react-roving-focus` (React 19
   compatible).

2. **`packages/ui/src/primitives/tabs.tsx`** — keep `TabItem`, the `Tabs` props
   (`items`, `active`, `onSelect`, `aria-label`), and the exact class strings.
   Wrap the tablist in `RovingFocusGroup.Root` and each tab in
   `RovingFocusGroup.Item`:
   - `<RovingFocusGroup.Root asChild orientation="horizontal" loop>` on the
     `<div role="tablist" aria-label className="flex flex-wrap gap-1 border-b
     border-border">`.
   - Each item: `<RovingFocusGroup.Item asChild active={item.id === active}>` on
     the `<button type="button" role="tab" aria-selected onClick={() =>
     onSelect(item.id)} className={…same…}>`. `active` designates the current
     Tab-stop (so the selected tab is the one reachable by Tab); RovingFocus sets
     `tabindex` 0/-1 and handles Left/Right/Home/End (with `loop`).
   - **Manual activation:** the native `<button>` fires `onClick` on
     click/Enter/Space, so a focused tab is selected with Enter/Space — arrow keys
     only *move focus*, they do not auto-select. This is deliberate: the workspace
     Code/Database panels lazy-load, so selection should not fire on every arrow
     press.

The `@evcp/ui` export of `Tabs`/`TabItem` and all 3 call sites are unchanged.

## Data flow

Consumer `<Tabs items active onSelect>` → RovingFocus manages focus/tabindex →
click/Enter/Space on a tab → `onSelect(id)` → consumer switches `active` and
renders its own panel. Unchanged from today apart from keyboard focus behaviour.

## Error handling

None new. RovingFocus is presentational focus management; no async or failure
paths. (If a consumer passes an empty `items` array, RovingFocus renders an empty
group — same as today.)

## Testing

- **Unit (`ui-primitives`/new `ui-tabs-radix`):** `Tabs` renders `role="tablist"`
  + one `role="tab"` per item with `aria-selected` on the active tab, keeps the
  `border-primary`/`text-primary` active styling, and renders via
  `renderToStaticMarkup` without throwing (RovingFocus SSRs statically).
- **Render smoke:** pages mounting `<Tabs>` (KnowledgeSkillsConsole,
  AiProvidersConsole, WorkspacePage) still render.
- **Typecheck** `@evcp/ui` + `admin-web` + `creator-web`; **design-system**;
  full unit + e2e + integration suites.
- **Visual + keyboard** — temporary styleguide route (add a `Tabs` sample to
  KitchenSink or reuse a page): confirm Left/Right/Home/End move between tabs,
  Enter/Space selects, only one tab is a Tab-stop, and the look is unchanged.
  Revert the temp route.

## Acceptance criteria

- `Tabs` is backed by `@radix-ui/react-roving-focus`; arrow keys, Home/End, and
  roving `tabindex` work; Enter/Space/click select.
- `Tabs`/`TabItem` API, ARIA, styling, and all 3 call sites are unchanged.
- `pnpm check` + e2e + integration pass; design-system clean.

## Out of scope (YAGNI)

- `@radix-ui/react-tabs` with `Content` panels / restructuring consumers.
- Automatic activation (arrow auto-selects) — manual activation is chosen for
  lazy panels.
- Drawer (Radix phase 3).

## Note

Both this branch and the Select branch (#167) add a `@radix-ui/*` dependency to
`packages/ui/package.json`. If they merge close together a trivial
`package.json`/lockfile conflict may surface (same insertion neighborhood);
resolve by keeping both dependency lines.
