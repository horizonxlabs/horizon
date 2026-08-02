# Radix UI Adoption — Phase 3 (final): Drawer — Design

**Status:** Approved for implementation.
**Date:** 2026-07-29
**Branch:** `codex/radix-drawer` (off `main`).

## Program context

Final phase of adopting Radix UI under the `@evcp/ui` stateful primitives. Phase 1
(`Select` via `@radix-ui/react-select`, PR #167) and phase 2 (`Tabs` via
`@radix-ui/react-roving-focus`, PR #168) are done. This phase: `Drawer`.

## Goal (Phase 3)

Back the `@evcp/ui` `Drawer` primitive with `@radix-ui/react-dialog` (a right-
anchored modal dialog) so it gets a real **focus trap** (the current hand-rolled
drawer only focuses the close button — Tab can escape to the background), plus
robust scroll lock, Escape-to-close, overlay-click-to-close, `aria-modal`,
background inert, and focus restoration on close — while keeping the exact
`Drawer` API and styling so all ~13 consumers are unchanged.

## Background — current state

- `Drawer({ open, onClose, title, description?, footer?, children, size? })` where
  `size ∈ {"md","lg","xl"}` maps to `max-w-md/2xl/3xl`. Renders a right-anchored
  panel with a header (title/description + × close button), a scrollable body, and
  an optional footer. It hand-rolls: focus-the-close-button on open, body scroll
  lock, an Escape `keydown` listener, and an overlay `<button>` that closes — but
  **no focus trap** and no focus restoration.
- **~13 consumers** across admin: guardrails (`GuardrailRuleDrawer`), ai-governance
  (`Credential/Provider/Route/Quota` drawers), user-management (`AddUser`,
  `ManageUser`), knowledge-skills (`SkillsPanel` ×3). All use `<Drawer open onClose
  title description? footer? size?>…</Drawer>`.
- `@evcp/ui` already depends on Radix (`react-select`, `react-roving-focus`).

## Components

1. **`packages/ui/package.json`** — add `@radix-ui/react-dialog` (React 19 compatible).

2. **`packages/ui/src/primitives/drawer.tsx`** — rewrite on Radix Dialog, preserving
   the `Drawer` props exactly:
   - `<Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>`
     — Radix drives open/close; `onOpenChange(false)` (Escape, overlay click, close
     button) → `onClose()`.
   - `<Dialog.Portal>` → `<Dialog.Overlay className="fixed inset-0 z-50
     bg-[rgba(15,23,42,0.4)]" />` and `<Dialog.Content className={cn("fixed
     inset-y-0 right-0 z-50 flex h-full w-full <widthClass> flex-col border-l
     border-border bg-surface shadow-card", …)}>`.
   - Inside Content: a header with `<Dialog.Title className="text-base font-semibold
     text-body">{title}</Dialog.Title>`, optional `<Dialog.Description className="…
     text-muted">{description}</Dialog.Description>`, and `<Dialog.Close
     className="…× button classes…">×</Dialog.Close>`; then the scrollable
     `{children}` body and the optional `{footer}`.
   - Remove the hand-rolled focus/scroll-lock/Escape effects and the overlay
     `<button>` (Radix owns all of it, plus the missing focus trap + restoration).
   - Keep `widthClass` (md/lg/xl) and the header/body/footer/close class strings.

The `@evcp/ui` export of `Drawer` and all ~13 call sites are unchanged.

## Data flow

Consumer `<Drawer open onClose …>` → `Dialog.Root(open)`; user closes via Escape,
overlay, or the × → `onOpenChange(false)` → `onClose()` → consumer sets `open`
false. Content is portaled to `document.body` (an overlay layer) — unchanged
user experience, but now with a proper focus trap.

## Error handling

None new. Radix Dialog handles modality; no async/failure paths. Radix requires a
`Dialog.Title` for a11y — always provided (`title` is required).

## Testing

- **Render smoke:** all consumers render with drawers **closed** (`open={false}`),
  where `Dialog.Root` renders nothing — unchanged and non-throwing. Confirm the
  admin/creator render paths still pass.
- **Important SSR limitation:** Radix `Dialog.Content` is **portaled**, so an OPEN
  drawer renders **empty** under `renderToStaticMarkup` (verified: `open` → 0-length
  output). Therefore the open drawer's markup **cannot** be asserted via the
  repo's SSR test harness. Any existing test that renders an open `Drawer` and
  asserts its title/body must be changed to assert the **closed** state (renders
  nothing / no throw) or removed; the open behaviour is covered by the visual check.
- **Typecheck** `@evcp/ui` + `admin-web`; **design-system**; full unit + e2e +
  integration suites.
- **Visual + a11y (temporary styleguide route):** render a `Drawer` sample open,
  and confirm: focus is trapped inside (Tab cycles within the drawer, does not
  reach the background), Escape closes, overlay click closes, the × closes, scroll
  is locked, and the panel looks identical (right-anchored, widths, header/footer).
  Revert the temp route.

## Acceptance criteria

- `Drawer` is backed by `@radix-ui/react-dialog` with a working focus trap, Escape,
  overlay-close, scroll lock, and focus restoration.
- `Drawer` API, styling, and all ~13 call sites are unchanged.
- `pnpm check` + e2e + integration pass; design-system clean.

## Out of scope (YAGNI)

- Non-modal drawers, animated slide-in transitions, or a `Drawer.Trigger` API.
- Changing the right-anchor placement or the size scale.

## Note

This is the third `@evcp/ui` branch adding a `@radix-ui/*` dependency (with #167
Select, #168 Tabs); a trivial `package.json`/lockfile merge conflict may surface —
keep all Radix dependency lines.
