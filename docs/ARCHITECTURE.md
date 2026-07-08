# Frontend architecture & code-health guardrails

This document exists because a few files grew to thousands of lines
(`apps/creator-web/src/main.tsx` hit 3499, `apps/admin-web/src/main.tsx` is still ~4976) and
became painful and risky to refactor. It records the conventions that keep new code maintainable
and the automated guardrails that enforce them.

## The convention: page = thin component + hook, logic in modules

A React app is decomposed so that **every unit is small, single-purpose, and independently
understandable** — the same principle applied to `creator-web`, which is now the reference layout:

```
apps/<app>/src/
  main.tsx           # entry: routes to a page component + createRoot. Stays tiny.
  types.ts           # shared types
  lib/               # PURE, framework-agnostic logic — unit-tested directly
    routing.ts       #   path→page, slugs, nav
    session.ts       #   token/session helpers
    <domain>.ts      #   API client, reducers (e.g. vibe-stream's applyVibeEvent)
  hooks/             # stateful glue — useState/useEffect/handlers, composed
    use-<app>.ts     #   top-level app state, may compose smaller hooks
    use-<slice>.ts   #   cohesive slices (e.g. use-vibe-workspace, use-publish-access)
  components/        # reusable presentational components, one per file
  data/              # static/mock data consts
  pages/             # one presentational component per screen, receives the hook result as `app`
    <Name>Page.tsx
```

**Rules of thumb**

- **Logic goes in `lib/` (pure) or `hooks/` (stateful), never inline in a page.** If you can't
  unit-test a piece of behaviour without rendering a component, it's in the wrong place. Pure
  reducers/selectors (like `lib/vibe-stream.ts`'s `applyVibeEvent`) are the highest-value thing to
  extract — they carry the tricky logic and get real tests.
- **One component per file. A page is presentational**: it reads `app.*` and renders; it does not
  own business logic.
- **Keep files small.** The hard limit is **400 lines** (enforced — see below). A file approaching
  it is a signal to split by responsibility, not to raise the limit.
- **Boy-scout rule:** when you touch a large legacy file, leave it a little smaller. The ratchet
  gate below guarantees it can only shrink.

## Guardrail 1 — the ratchet large-file gate

`scripts/quality/check-changed.mjs` fails any changed `.ts`/`.tsx`/`.mjs` file over **400 lines**,
with a _ratchet_:

- A **brand-new** file over 400 lines is blocked outright — split it.
- Files already over 400 when the gate was introduced are recorded in
  `scripts/quality/large-file-baseline.json` at their current length. They are grandfathered (they
  don't have to be ≤400 yet) but **may not grow past that recorded ceiling** — the debt can only
  shrink, never grow.
- When you intentionally shrink a baselined file, run
  `node scripts/quality/update-large-file-baseline.mjs` to lock the new, lower ceiling in (and drop
  files that fall to ≤400 out of the baseline entirely).

Runs locally in the pre-commit hook (`pnpm check:staged`) and in CI on every PR
(`pnpm check:changed --base origin/<base>`).

## Guardrail 2 — the render-smoke harness

`tsc` and `vite build` both **pass** on code that throws at render time — a dropped
`import { appMembers }` only surfaces as a runtime `ReferenceError` once React actually renders. A
`creator-web` refactor once shipped exactly that past the static checks; only opening a browser
caught it.

`tests/unit/creator-web-render-smoke.test.mjs` closes that gap: it renders the real `useCreatorApp`
hook and every page via `renderToStaticMarkup` (browser globals stubbed, no network — effects don't
run under static render), so any bare-undefined reference or render-time throw fails a test. This is
the safety net that makes stateful-component refactors safe.

**When you split a component/hook, add or extend a render-smoke test for it.** To cover another app
(e.g. `admin-web`), copy the harness pattern: stub `window`/`localStorage`/`document`/`fetch`, set
`globalThis.React`, and `renderToStaticMarkup` the top-level hook + each page.

Runs in CI via `check:ci` → `test:unit` (the `tests/unit/*.test.mjs` glob).

## Applying this to the rest of the codebase

The baseline in `large-file-baseline.json` is the backlog of files to decompose over time
(`platform-services.ts` 8100, `admin-web/main.tsx` 4976, `app-factory.ts` 4279, …). Each is
grandfathered but ratcheted down. When you next work in one, split off a focused module and
re-baseline. `creator-web` (main.tsx: 3499 → 77) is the worked example.
