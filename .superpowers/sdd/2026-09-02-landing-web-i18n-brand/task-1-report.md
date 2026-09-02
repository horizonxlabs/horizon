# Task 1 report — Fonts + logo

Status: **DONE**

## What was implemented

Two pre-existing defects in `apps/landing-web` (and the shared `packages/ui` design
system) fixed, per `task-1-dispatch.md` / `task-1-brief.md`. Locale routing,
translations, switcher, and docs (tasks 2–5) were **not** touched.

### a) Fonts never actually loaded

`packages/ui/fonts/` bundles five LINE Seed Sans TH `.woff2` files, but nothing
declared `@font-face` for them, so Thai text fell through to whatever Thai font the
OS happened to ship (Thonburi on macOS). Separately, `--evcp-font-sans` composed the
stack Thai-first — since font fallback is per-glyph, that meant *English* text was
also being rendered from a Thai face on any machine with one installed.

Fixed by:
- New `packages/ui/fonts.css`: five `@font-face` declarations for `"LINE Seed Sans TH"`,
  one per bundled file, with the correct numeric weight per filename suffix
  (`_Th`=250, `_Rg`=400, `_Bd`=700, `_He`=800, `_XBd`=900), `font-style: normal`,
  `font-display: swap` on all five.
- `packages/ui/styles.css`: added `@import "./fonts.css";` (after `theme.css`, before
  `creator-project-switcher.css`).
- `packages/ui/package.json`: added `"./fonts.css": "./fonts.css"` export.
- `packages/ui/theme.css`: flipped `--evcp-font-sans` to `var(--evcp-font-latin), var(--evcp-font-thai), sans-serif`
  (was Thai-first). This is a global design-system token change, so it applies to
  all four apps by construction, not just landing-web.
- Landing-web additionally self-hosts `Inter` via `next/font/google` in
  `apps/landing-web/src/app/layout.tsx` (`variable: "--font-inter"`, `display: "swap"`,
  applied via `className={inter.variable}` on `<html>`), and
  `packages/ui/marketing.css` (imported only by `apps/landing-web/src/app/globals.css`)
  overrides `--evcp-font-latin` to prefer `var(--font-inter)` ahead of the generic
  `Inter` family name, so landing-web gets the optimized self-hosted face instead of
  relying on the browser to have Inter installed.

Google Fonts network access was verified reachable at build time (`curl` to
`fonts.googleapis.com` returned HTTP 200) before relying on `next/font/google` —
this was **not** a BLOCKED condition.

### b) Nav showed a text wordmark instead of the real logo

Fixed by:
- Copied `apps/creator-web/public/horizon-logo.png` (984×254 PNG, confirmed via
  `file`) to `apps/landing-web/public/horizon-logo.png`.
- `apps/landing-web/src/shared/site-nav.tsx`: replaced the text wordmark with
  `next/image`, `src="/horizon-logo.png"`, `width={984} height={254}`,
  `alt="Horizon — enterprise AI application builder"` (from `siteConfig.name`),
  `className="h-7 w-auto"`.

**Deliberate deviation from the brief's literal example**: the brief's snippet used
a `priority` prop; I used `preload` instead. Per
`apps/landing-web/node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
(version-changes table), Next 16.0.0 added `preload` and deprecated `priority`. Since
this is a Next 16.3.4 codebase, `preload` is correct.

**Footer left unchanged.** The brief allowed "use the same image in the footer at a
smaller height if it reads well; otherwise leave the footer text and say why." I left
`apps/landing-web/src/shared/site-footer.tsx` as-is: it currently states
"Horizon — enterprise AI application builder, developed in the open" as text, and
replacing that with just a logo image would lose that description with no clear
readability gain. The brief called this optional.

## TDD evidence

`tests/unit/ui-fonts.test.mjs` was created verbatim per the brief before any fix code.

**RED** (before `packages/ui/fonts.css` existed):

```
$ node --import tsx --test tests/unit/ui-fonts.test.mjs
✖ ENOENT: no such file or directory, open 'packages/ui/fonts.css'
```

**GREEN** (after the fix, re-run at the end of this session to confirm current state):

```
$ node --import tsx --test tests/unit/ui-fonts.test.mjs
✔ every bundled font file is actually declared with @font-face (0.64ms)
✔ declared faces use woff2 and swap display (0.10ms)
✔ the sans stack resolves Latin before Thai (0.11ms)
✔ the landing app ships the real logo, not a text wordmark (0.10ms)
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

## Gate results (final run, this session)

```
$ node --import tsx --test tests/unit/ui-fonts.test.mjs
4/4 pass

$ pnpm test:unit
ℹ tests 1392
ℹ pass 1391
ℹ fail 0
ℹ skipped 1     (pre-existing, unrelated skip — not introduced by this change)

$ pnpm lint
Sprint lint checks passed
oxlint --deny-warnings apps packages tests scripts  → clean

$ pnpm typecheck
11/11 workspace projects (all apps + packages) → Done, no errors

$ pnpm check:frontend-architecture
[frontend-architecture] checks passed

$ node scripts/quality/check-design-system.mjs apps/landing-web/src/shared/site-nav.tsx apps/landing-web/src/app/layout.tsx
[design-system] UI governance check passed
```

Per the dispatch, **bare `pnpm check` was not used as a gate** — it is already red at
`apps/creator-web/src/features/workspace/WorkspacePage.tsx:276`, a pre-existing,
adjudicated, out-of-scope issue that was not touched.

### Four app builds

All four apps build successfully:

- `pnpm --filter @evcp/landing-web build` — compiles, `next/font/google` fetches and
  self-hosts Inter at build time (no runtime network dependency), static pages
  generated for `/`, `/_not-found`, `/robots.txt`, `/sitemap.xml`.
- `pnpm --filter @evcp/creator-web build` — succeeds. Emits
  `dist/assets/LINESeedSansTH_W_*-<hash>.woff2` for all five weights.
- `pnpm --filter @evcp/admin-web build` — succeeds, same font assets emitted.
- `pnpm --filter @evcp/app-store-pwa build` — succeeds, same font assets emitted.

Creator-web and app-store-pwa each print benign Vite warnings during build, e.g.:

```
/creator/fonts/LINESeedSansTH_W_Th.woff2 referenced in /creator/fonts/LINESeedSansTH_W_Th.woff2
didn't resolve at build time, it will remain unchanged to be resolved at runtime
```

This is because those two apps are served under a base path (`/creator/`, `/store/`)
and `fonts.css`'s `url(...)` references resolve as absolute paths at author time.
Confirmed **non-fatal**: the actual built CSS in both apps' `dist/assets/*.css`
references the correctly content-hashed emitted files (e.g.
`url(/creator/assets/LINESeedSansTH_W_Th-CFyqbmal.woff2)`), and the hashed `.woff2`
files are present in `dist/assets/`. admin-web (no base path) shows no such warning.

## Visual verification (not just a CSS diff)

Built landing-web standalone (`rm -rf apps/landing-web/.next && pnpm --filter
@evcp/landing-web build`), copied both `.next/static` and `public/` into
`.next/standalone/apps/landing-web/` (the literal Dockerfile copy set — the
dispatch's example command only mentioned `.next/static`, but
`docker/landing-web.Dockerfile` copies both, and omitting `public/` would have made
the logo 404 in this manual check), ran `node server.js` on port 3011, curled `/` and
`/horizon-logo.png` (both HTTP 200), then captured a headless-Chrome screenshot of
`http://127.0.0.1:3011/` at 1440×900 and read it directly.

What the screenshot shows:
- **Logo**: the nav renders the real Horizon logo lockup (a filled navy circular mark
  plus "Horizon" wordmark) at the top left, correctly sized, no stretching or
  clipping, aligned with the rest of the nav row.
- **Nav**: all configured items render correctly — Platform, How it works, Security,
  Self-host, FAQ, plus the "GitHub" pill button on the right.
- **Font**: the hero headline "Ship internal software at AI speed — under enterprise
  control." renders in a clean Latin grotesque sans (Inter), not a Thai-faced
  fallback — confirming the Latin-first stack and self-hosted Inter are both taking
  effect for English copy.
- No other visual regressions observed (hero card, gradient background, CTA buttons,
  eyebrow text all render as expected).

Standalone server was stopped afterward (`kill` on the background process); no
lingering process left running.

## Files changed

- `packages/ui/fonts.css` — new, 5 `@font-face` declarations.
- `packages/ui/theme.css` — Latin-first `--evcp-font-sans`.
- `packages/ui/styles.css` — `@import "./fonts.css";`.
- `packages/ui/package.json` — `"./fonts.css"` export.
- `packages/ui/marketing.css` — landing-web-scoped `--evcp-font-latin` override to
  prefer `var(--font-inter)`.
- `apps/landing-web/public/horizon-logo.png` — new, copied from creator-web.
- `apps/landing-web/src/app/layout.tsx` — `next/font/google` Inter self-host;
  `import "./globals.css";` kept verbatim.
- `apps/landing-web/src/shared/site-nav.tsx` — real logo via `next/image`
  (`preload`, not deprecated `priority`).
- `tests/unit/ui-fonts.test.mjs` — new, TDD spec from the brief.
- `tests/unit/landing-web-render-smoke.test.mjs` — updated: added a
  `registerHooks()`-based shim so the static `import Image from "next/image"` in
  `site-nav.tsx` resolves under the test runner (see next section), plus a new test
  asserting the logo lockup renders with meaningful alt text.

## Render-smoke test regression: root cause and fix

Adding the real `next/image` import to `site-nav.tsx` broke
`tests/unit/landing-web-render-smoke.test.mjs` with `Error: Element type invalid:
expected a string ... but got: object` during `renderToStaticMarkup`.

Root cause: `next/image`'s CJS module
(`next/dist/shared/lib/image-external.js`) hints its named exports to
`cjs-module-lexer`-aware tooling via the SWC-authored dead-code pattern
`0 && (module.exports = { default: null, getImageProps: null });`. Node's own
dynamic `import()` understands this pattern and resolves `.default` to the real
`React.forwardRef` component. `tsx`'s esbuild-based **static** `import X from
"next/image"` transform does not recognize the pattern (verified with both default
and namespace import forms — both fail identically) and instead binds the raw
`{ default: [Getter], getImageProps: [Getter] }` wrapper object, which is not a
valid React element type. This is a test-tooling-only limitation: the real Next.js
build (SWC/webpack, which authored the hint) resolves it correctly — confirmed by
the successful `next build` above, and this is literally the canonical way every
real Next.js app imports `next/image`.

Fix: used Node's `node:module` `registerHooks()` API (stable, synchronous, no
deprecation warning — unlike the older `register()` API, which is deprecated,
requires async worker-thread-style setup, and additionally broke on a
non-hierarchical shim URL scheme with `TypeError: Invalid URL` during
`package.json`-scope lookups) to intercept only the `next/image` specifier inside
the render-smoke test file and substitute a minimal `<img>`-rendering shim. This
keeps `SiteNav`'s real render logic (nav items, hrefs, labels, and now the logo
`src`/`alt`) under genuine render-smoke coverage without touching production code.

**Maintenance-surface concern**: this shim assumes `next/image`'s CJS shape
(`default` + `getImageProps` exports). If a future Next.js upgrade changes that
shape, the *real* app would still work fine (SWC/webpack resolve correctly
regardless), but this test-only shim might need updating — it is scoped to the
`next/image` specifier only, so a change here can't mask a real app-level regression
in the imports it doesn't intercept.

## Self-review checklist

- **All five bundled weights declared with correct numeric weights?** Yes —
  `_Th`=250, `_Rg`=400, `_Bd`=700, `_He`=800, `_XBd`=900, one `@font-face` block
  each, verified against `packages/ui/fonts.css` content and the `ui-fonts.test.mjs`
  assertion that face count matches bundled file count.
- **Does the Latin-first change actually reach all four apps?** Yes — it's a change
  to `packages/ui/theme.css`, the single shared design-system token file imported by
  `packages/ui/styles.css`, which all four apps consume. Confirmed no app overrides
  `--evcp-font-sans` itself; `marketing.css`'s override is scoped to a different
  token (`--evcp-font-latin`, which only widens the Latin *face* preference for
  landing-web without touching the Latin-before-Thai *ordering* that the other three
  apps also get).
- **Does the logo have meaningful alt text?** Yes —
  `"Horizon — enterprise AI application builder"` (derived from `siteConfig.name`),
  not empty or filename-derived.
- **Do the tests assert structure rather than exact CSS text that will rot?** Yes —
  `ui-fonts.test.mjs` checks that every bundled `.woff2` filename appears in
  `fonts.css`, that face count matches file count, and that `font-display: swap` is
  present, rather than asserting a specific formatted string; the Latin-before-Thai
  check compares token *positions* within the resolved stack rather than matching
  literal font names.

## Concerns

- The render-smoke `next/image` shim (see above) is a test-tooling workaround, not
  an app change — flagged as a maintenance surface if `next/image`'s internal CJS
  export shape changes in a future Next.js upgrade.
- `site-footer.tsx` intentionally left as text-only (no logo image) — see reasoning
  above; this was explicitly optional in the brief.
- No other concerns. All required gates pass; working tree is clean except for the
  intended file set below.
