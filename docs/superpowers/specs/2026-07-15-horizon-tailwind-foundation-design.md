# Horizon UI Redesign — Foundation (Tailwind v4) Design

Date: 2026-07-15
Status: Approved design (brainstorming complete)
Scope: Sub-project #1 of 5 — the shared design-system foundation
Owner surface: `packages/ui` (`@evcp/ui`)

## 1. Context

Horizon has a mature, CI-governed hand-rolled design system today: a single entrypoint
`@evcp/ui`, all tokens/CSS in `packages/ui/styles.css` (~6,900 lines), LINE Seed Thai fonts,
and a governance check that scans `apps/*/src` and fails on app-local stylesheets, inline
visual styles, hardcoded colors, and non-`@evcp/ui` CSS imports. The three surfaces
(`admin-web`, `creator-web`, `app-store-pwa`) already consume components from `@evcp/ui`
rather than styling locally.

The user has decided to **redesign the entire UI onto Tailwind CSS**, accepting that this
replaces the current governance model and rewrites the design system. This is a large,
multi-surface effort, so it is decomposed into sub-projects. **This document specifies only
sub-project #1, the Foundation.** The surface rewrites are separate specs.

### Decomposition (agreed)

1. **Foundation** (this doc) — Tailwind v4 setup, new token system, core primitives, new
   governance, coexistence with the legacy system.
2. Admin Console (`admin-web`) rewrite onto new primitives.
3. Creator App (`creator-web`) rewrite.
4. Store PWA (`app-store-pwa`) rewrite (may relax density for end users).
5. Generated-app runtime surfaces.

Each surface sub-project gets its own spec → plan → implementation cycle.

## 2. Goals

- Introduce Tailwind v4 as the styling engine for `@evcp/ui`, with a single-source-of-truth
  token system encoded via `@theme`.
- Establish the **Sapphire Clean / Crisp-Dense** visual language (see §4) as reusable
  primitives built with `class-variance-authority` (cva).
- Replace the governance model with one appropriate to Tailwind (§6), enforced by lint.
- Do all of the above **without breaking the running apps** — the legacy `styles.css` and the
  new Tailwind system coexist; surfaces migrate later, one sub-project at a time.

## 3. Non-goals

- Migrating any surface (`admin-web`, `creator-web`, `app-store-pwa`) — that is sub-projects 2–5.
- Deleting `packages/ui/styles.css` — it shrinks as surfaces migrate and is removed at the
  end of the overall effort, not here.
- Shipping a dark theme — the token system is built dark-ready (§5), but only the light theme
  ships now.
- Building every conceivable component — only the shared core primitives (§7). Surface-specific
  components are built in their surface's sub-project (YAGNI).

## 4. Visual direction (locked)

**Identity — "Sapphire Clean":** an evolution of the current blue toward a crisp, modern-SaaS
look (Stripe/Linear caliber, light default).

- Primary: blue-600 `#2563eb`; strong `#1d4ed8`; soft `#dbeafe`.
- Neutrals: slate scale; page `#f8fafc`, surface `#ffffff`, border `#e2e8f0` / soft `#eef2f7`,
  text `#0f172a`, muted `#64748b`.
- Status: existing success/warning/danger/info bg+text pairs are retained.
- Type: Thai-first stack — LINE Seed Sans TH → Inter/system for Latin (keep existing fonts).

**Density & depth — "Crisp / Dense":** hairline borders, `8px` card/control radius, minimal or
no shadow, tight rows, high data-per-screen. This preserves the existing "dense but readable
enterprise" principle while modernizing the palette. (The Store PWA may relax this in its own
sub-project.)

## 5. Token architecture (two layers, dark-ready)

Single source of truth: **`packages/ui/theme.css`**, imported through `@evcp/ui/styles.css` so
app surfaces still import only that one stylesheet.

- **Layer 1 — reference tokens:** raw palette values (`--blue-600`, slate scale, status hexes).
  Raw hex values live *only* here.
- **Layer 2 — semantic tokens:** intent-named tokens mapped from layer 1 —
  `--color-surface`, `--color-surface-muted`, `--color-page`, `--color-border`,
  `--color-border-soft`, `--color-text`, `--color-muted`, `--color-primary`,
  `--color-primary-strong`, `--color-primary-soft`, status pairs, etc. Defined under `:root`
  for light. A `.dark { }` block is reserved and left empty for now.
- **Tailwind theme:** `@theme` maps utilities to the *semantic* tokens via `var()`, so
  `bg-surface`, `text-muted`, `border-border`, `text-primary`, etc. resolve through layer 2 and
  will theme-switch later without touching any component.

Rule: components and app code reference semantic utilities/tokens only — never layer-1 values
or raw hex.

## 6. Governance (new model: "component-first, guarded utilities")

Replaces the current design-system governance stance for the coexistence window.

- **Full Tailwind utility usage is allowed only inside `packages/ui`.**
- **App code (`apps/*/src`)** may use **layout/spacing utilities only** — `flex`, `grid`,
  `gap-*`, `p-*`, `m-*`, `w-*`, sizing, and typography-scale utilities drawn from the token
  scale. App code may **not** use color/shadow/radius utilities (`bg-<color>`, `text-<color>`,
  `shadow-*`, `rounded-*` beyond tokens) — all color, elevation, and shape come from `@evcp/ui`
  components + semantic tokens.
- **Banned everywhere:** arbitrary values (`bg-[#…]`, `p-[13px]`), raw hex in app code,
  app-local `.css` files, inline `style` attributes carrying visual styling, and CSS imports
  other than `@evcp/ui/styles.css`.

Enforcement:

- `eslint-plugin-tailwindcss` (no arbitrary values, no contradicting/duplicate classes,
  enforce shorthand) + `prettier-plugin-tailwindcss` for class ordering.
- A lint rule restricting color/shadow/radius utilities within `apps/**`.
- The existing changed-file governance script is updated to: allow Tailwind utilities within
  `@evcp/ui`, keep banning app-local stylesheets / inline visual styles / hardcoded hex in
  `apps/*/src`, and keep enforcing the single `@evcp/ui/styles.css` import.

## 7. Primitives to build (cva + Crisp/Dense)

Core primitives shared by all surfaces. Each is a cva-based component using a `cn()` helper
(`clsx` + `tailwind-merge`). Keep existing export names/props where practical to reduce churn.

- `Button` — variants: primary / secondary / ghost / danger; sizes: sm / md.
- `Card` / `SectionCard`.
- `Badge`, `StatusPill`, `ToneBadge`.
- `Input`, `Field`, `Select` (dense form controls).
- `Table` primitives (dense: header / row / cell).
- `MetricCard` (KPI).
- `AppShell` (sidebar + topbar chrome), rebuilt on the new system.
- `PageHeader`.

Surface-specific components (Creator workspace panels, Store cards, etc.) are out of scope
here.

## 8. File structure (coexistence window)

```
packages/ui/
  theme.css              # NEW — @theme + two-layer tokens (source of truth)
  styles.css             # EXISTING — kept; imports theme.css; shrinks as surfaces migrate
  src/
    cn.ts                # NEW — clsx + tailwind-merge helper
    primitives/*.tsx     # NEW — Button, Card, Badge, Input, Table, MetricCard, ...
    app-shell.tsx        # rebuilt on new primitives
    index.tsx            # re-exports legacy + new components (coexist)
```

Each app adds the `@tailwindcss/vite` plugin and continues importing `@evcp/ui/styles.css`.

## 9. Dependencies to add

- Runtime: `class-variance-authority`, `tailwind-merge`, `clsx`.
- Build/dev: `tailwindcss@4`, `@tailwindcss/vite`, `eslint-plugin-tailwindcss`,
  `prettier-plugin-tailwindcss`.

## 10. Acceptance criteria (Foundation "done")

- A **kitchen-sink preview** renders every new primitive in the Sapphire Clean / Crisp-Dense
  look for visual review.
- `pnpm typecheck` passes; the new governance lint passes.
- All three existing apps still build and run unchanged (legacy `styles.css` intact).
- No surface has been migrated — that begins in sub-project #2.

## 11. Risks

- **Tailwind v4 + Vite 7 + React 19 integration** — verify the `@tailwindcss/vite` plugin and
  the existing `react-data-grid` CSS import coexist. Mitigate by wiring one app first.
- **Governance gap during coexistence** — two styling systems live at once; the updated lint
  must not let app code start using color utilities early. Mitigate with the `apps/**` color
  restriction rule landing in this sub-project.
- **Token drift** — legacy `styles.css` and `theme.css` must agree on values during coexist.
  Mitigate by having `styles.css` consume `theme.css` variables rather than duplicating hexes.
