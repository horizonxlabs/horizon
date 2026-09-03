# Landing Web Design

Date: 2026-09-02

## Summary

Horizon gains a public marketing site at `apps/landing-web`: a Next.js 16 App Router
application rendered on the server, bilingual in Thai and English, deployed to Railway as
its own service. It is a workspace member so that it consumes the real design tokens from
`@evcp/ui` instead of copying colours by hand, but it is deployment-independent from the
private-server Compose stack — it never touches `docker/Caddyfile`,
`docker/docker-compose.yml`, or `platform-api`.

The visual direction is _light premium_: the same slate/blue canvas users see after they
sign in, with the "modern" quality coming from typography scale, generous spacing, a low
alpha mesh gradient, and restrained scroll motion — not from inverting to a dark theme.

The project is open source, so the calls to action point at the repository and the
self-host quick start rather than at a sales funnel.

## Goals

- Ship a public landing page that explains what Horizon is and how to run it.
- Reuse `packages/ui` design tokens so the site cannot drift from the product palette.
- Pass the existing repository quality gate (`pnpm check`) without weakening any rule.
- Deploy to Railway from this monorepo with no runtime dependencies.
- Keep every section small enough to unit-test without a browser.

## Non-goals

- No CMS, blog, changelog, or content pipeline.
- No contact form, mail provider, or lead capture backend.
- No analytics or third-party tracking.
- No dark theme.
- No authentication, database, or `platform-api` calls.
- No changes to `docker/Caddyfile`, `docker/docker-compose.yml`, or any existing app.

## Workspace placement

The app lives at `apps/landing-web` and is picked up by the existing `apps/*` glob in
`pnpm-workspace.yaml`.

| Concern     | Decision                                                         |
| ----------- | ---------------------------------------------------------------- |
| Framework   | Next.js `16.3.4`, App Router, server components by default       |
| React       | `^19.2.8`, matching the version pinned across the repo           |
| Styling     | Tailwind v4 through `@tailwindcss/postcss`                       |
| Shared code | `@evcp/ui": "workspace:*"` for tokens, utilities, and primitives |
| Icons       | `lucide-react`, already used by `creator-web`                    |
| Dev port    | `4103` (admin `4100`, creator `4101`, store `4102`)              |

`scripts/quality/check-workspace-scripts.mjs` requires every workspace package to expose
`build` and `typecheck`, and the root `build`/`typecheck` scripts fan out over
`./apps/*`. The package therefore declares:

```json
{
  "dev": "next dev --port 4103",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

The root `package.json` gains `dev:landing` only. The parallel `pnpm dev` script keeps
its current four targets, because the landing page is not part of the platform
development loop.

## Visual language

Every colour resolves to a token already defined in `packages/ui/theme.css`. No new
reference-palette (layer 1) value is introduced.

| Element               | Token                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Page canvas           | `--evcp-color-page`, alternating with `--evcp-color-surface` per band                        |
| Hero mesh gradient    | radial blends of `--evcp-color-primary-soft` and `--evcp-color-accent` at low alpha          |
| Primary action        | `--evcp-color-primary`, hover `--evcp-color-primary-strong`, label `--evcp-color-on-primary` |
| Body / secondary text | `--evcp-color-text` / `--evcp-color-muted`                                                   |
| Cards                 | `--evcp-radius-card`, `--evcp-shadow-card`, lifted state `--evcp-shadow-pop`                 |
| Type family           | `--evcp-font-sans`                                                                           |

The premium feel is produced by four devices:

1. **Display typography.** A hero headline at 64–72px with `text-balance`, stepping down
   through a deliberate scale rather than arbitrary sizes.
2. **Air.** Section padding roughly double the product surfaces; content capped at a
   readable measure and centred.
3. **One signature gradient.** A single soft mesh behind the hero and the final CTA,
   never repeated in between, so it reads as a brand mark rather than decoration.
4. **Restrained motion.** `shared/reveal.tsx` is a plain server component — it renders
   `<div className="evcp-reveal">{children}</div>` and nothing else. The fade-and-lift is
   layered on entirely in CSS: `.evcp-reveal` is visible unconditionally, and the animation
   applies only inside `@supports (animation-timeline: view())` combined with
   `@media (prefers-reduced-motion: no-preference)`. Every degradation path — no
   `animation-timeline` support, reduced motion, or no JavaScript at all — ends at
   "visible, not animated," never at "invisible," and the app ships zero client components.

The hero product visual is a static composition built from real `@evcp/ui` primitives —
a stylised Creator workspace — rather than a screenshot, so it stays truthful as the
product evolves and stays crisp at any density.

## Marketing tokens

The landing page needs shapes the product does not have: a hero gradient, a soft glow
elevation, and a larger radius for oversized surfaces. These are added as
`packages/ui/marketing.css`, a layer 2 file derived from the same layer 1 references,
exported as `@evcp/ui/marketing.css`.

```css
/* packages/ui/marketing.css — shape illustrative, exact stops tuned during implementation */
:root {
  --evcp-gradient-hero: radial-gradient(/* --ref-blue-100 and --ref-sky-400 at low alpha */);
  --evcp-shadow-glow: /* --ref-blue-600 at low alpha, wide blur */;
  --evcp-radius-hero: 28px;
}
```

The constraint that matters is not the exact stops but the source: every value must be
expressed in terms of a layer 1 `--ref-*` variable, never a fresh literal.

`marketing.css` also exposes the classes built from those tokens — `.evcp-hero-gradient`,
`.evcp-glow-card`, `.evcp-code-block`, `.evcp-reveal` — following the precedent of the existing
`packages/ui/creator-project-switcher.css`. This matters for governance: the design-system
check only accepts `shadow-card` and `rounded-card|control|pill` as shape utilities, so
exposing marketing shapes as Tailwind utilities would require loosening that rule. Named
classes keep the rule untouched and keep the intent readable at the call site.

They are kept out of `theme.css` so the product design system is not polluted by values
used on exactly one page, while styling still lives only inside `packages/ui` as the
repository requires.

## Quality-gate integration

### Design system governance

`scripts/quality/check-design-system.mjs` currently hardcodes three app source
directories, so a new app would be silently unchecked. `apps/landing-web/src` is added
to `APP_SRC_DIRS`, with two narrow amendments:

1. `@evcp/ui/marketing.css` joins `@evcp/ui/styles.css` in the approved import list.
2. `apps/landing-web/src/app/[lang]/globals.css` is exempt from the "no app-local
   stylesheet" rule, because Next.js requires a CSS entry point. The exemption is conditional: the
   file may contain only comments, `@import "@evcp/ui/…"` statements, and `@source`
   directives (Tailwind v4 needs one to scan the app's own sources). Any CSS declaration,
   selector, or other import fails the check. `@source` cannot introduce a colour or a
   shape, so allowing it does not weaken the rule.

Everything else still applies to the landing page — no hex literals, no `rgb()`, no
inline `style={{}}`, no Tailwind palette utilities such as `bg-slate-900`, no arbitrary
values, and only `rounded-card`/`rounded-control`/`rounded-pill` plus `shadow-card` for
shape.

### Frontend architecture

`scripts/quality/check-frontend-architecture.mjs` matches any `apps/*/src/**` file when
invoked with `--files` (the `check:changed` path); `landing-web` was also added to
`APP_NAMES` so it is governed on a full run too. Source roots are therefore restricted to
`app`, `features`, and `shared`, cross-module imports use `@/` aliases, `shared` never
imports `features`, and features are consumed through their `index.ts`. The Next.js App
Router layout satisfies this naturally. `src/proxy.ts` is Next's middleware convention
(the file must live at the source root) and is exempted the same way Vite's `main.tsx`
already is, via `FRAMEWORK_ENTRY_FILES`, rather than being tracked in the legacy-path
baseline.

### File size

New files are capped at 400 lines by `scripts/quality/check-changed.mjs`. Sections are
split so that copy lives in data modules and each component stays presentational.

## File layout

```text
apps/landing-web/
  next.config.ts          output: "standalone", outputFileTracingRoot -> monorepo root
  postcss.config.mjs      @tailwindcss/postcss
  tsconfig.json           extends tsconfig.base.json, "@/*" -> "./src/*"
  package.json
  public/                 horizon-logo.png, plus a .gitkeep so the empty dir survives git
  src/
    app/
      [lang]/
        layout.tsx        html/body shell, per-locale metadata, font wiring
        page.tsx          composition only — renders the section components in order
        globals.css       @import "@evcp/ui/styles.css"; @import "@evcp/ui/marketing.css";
      sitemap.ts          stays at the app root — nesting under [lang] breaks Next's
                           metadata-route convention — with one entry per locale
      robots.ts           stays at the app root for the same reason
    proxy.ts               Next's middleware convention: `/` redirects to the default locale
    features/
      hero/                index.ts + hero-section.tsx + hero-content.ts + hero-product-visual.tsx
      surfaces/
      lifecycle/
      governance/
      self-host/
      open-source/
      faq/
      final-cta/
      site-footer/         chrome, not a page section, but locale-keyed copy still needs the
                            same completeness/Thai-script coverage — see Testing below
    shared/
      site-nav.tsx
      section.tsx          band wrapper with a page/surface tone
      section-heading.tsx
      action-button.tsx
      reveal.tsx           plain server component, CSS-only fade (no client JS)
      site-config.ts       repository URL, nav items
      content-types.ts
      locale.ts            Locale, LOCALES, DEFAULT_LOCALE, isLocale, LocaleProps
      language-switcher.tsx + language-switcher-content.ts
      metadata-content.ts  per-locale <title>/<meta description> copy
```

Copy lives beside the section that renders it — `features/hero/hero-content.ts`, and so on
— because copy and layout change together. Only genuinely cross-cutting values (the
repository URL, the navigation list) sit in `shared/site-config.ts`. Sections read typed
data and render it, which keeps components pure, keeps files under the size cap, and makes
the content independently testable.

Same-feature relative imports are permitted by `check-frontend-architecture.mjs`, so a
feature reaching its own content file needs no alias; everything crossing a boundary uses
`@/`.

### Unit-test alias resolution

`tsconfig.test.json` currently maps `@/*` to `apps/creator-web/src/*` only, so landing
components would fail to resolve their `@/shared/…` imports under the test runner. The
mapping becomes an ordered array:

```json
"@/*": ["./apps/creator-web/src/*", "./apps/landing-web/src/*"]
```

`tsx` tries each entry and falls through to the next when a path does not exist on disk;
this was verified against a throwaway two-package fixture before the approach was
adopted. The first landing test task re-verifies it, so the harness is proven before any
section depends on it.

## Page structure

Bilingual: `th` (Thai, the default) and `en`, both statically prerendered via
`generateStaticParams`. `/` redirects to `/th`. Locale is passed down as an explicit prop
rather than read via `next/root-params` — the Next 16 idiom would make every section an
async component, and `renderToStaticMarkup`, which every render-smoke test in this repo
depends on, cannot render those. `sitemap.ts` and `robots.ts` stay at the `app/` root
because Next's metadata-route conventions require it; nesting them under `[lang]` silently
produced no robots route and a `/-/sitemap.xml`. The font stack is Latin-first so Latin
renders from Inter and Thai from LINE Seed within one sentence, with the bundled Thai
faces declared via `@font-face` in `packages/ui/fonts.css`.

Copy is drawn from `README.md` so the site and the repository stay consistent, then
translated into both locales.

1. **Nav** — Horizon mark, anchor links (Platform, How it works, Security, Self-host,
   FAQ), and a GitHub link.
2. **Hero** — headline, one-sentence subhead, primary action _Get started_ to the
   self-host section, secondary action _View on GitHub_, and the product visual.
3. **Three surfaces** — Admin Console, Creator App, App Store PWA, taken from the
   surface table in `README.md`.
4. **Lifecycle** — Idea → PRD → AI workspace → Preview → Publish, presented as five
   numbered steps.
5. **Governance and security** — provider key protection through OpenBao, quotas and
   guardrails, per-project container and schema isolation, SSO through Keycloak,
   policy-based publish approval, usage and audit evidence.
6. **Self-host** — the stack it runs on (Postgres, Redis, MinIO, Keycloak, LiteLLM,
   Caddy) and the real quick start, `pnpm dev:setup`, in a code block.
7. **Open source** — repository link, contribution pointer, and the technology stack.
8. **FAQ** — four short questions covering which AI models are supported, where data
   lives, whether Kubernetes is possible, and how production-ready the platform is.
   There is deliberately no licensing question: the repository has no `LICENSE` file yet,
   and the site must not state a licence that does not exist. The entry is added once one
   is chosen.
9. **Final CTA + footer** — repeat of the two actions over the signature gradient.

### Calls to action

The project is open source, so there is no demo request. Actions are:

- Primary: **Get started** → `#self-host` on the page.
- Secondary: **View on GitHub** → `https://github.com/0xlabsTeam/EnterpriseVibeCodingPlatform`.

The repository URL lives once in `shared/site-config.ts`. The repository currently has no
`LICENSE` file; adding one is a separate decision, and the site claims no licence until it
exists.

## Build-output hygiene

Next.js writes to `.next/`, a directory this repository has never had to ignore. Three
files need the pattern, or the gate breaks in ways unrelated to the page itself:

- `.gitignore` — otherwise the build output is committable.
- `.prettierignore` — otherwise `pnpm format` rewrites generated files.
- `.oxlintrc.json` `ignorePatterns` — `lint:code` runs `oxlint --deny-warnings apps`, so
  generated chunks would be linted and fail.

## Deployment

A dedicated `docker/landing-web.Dockerfile` builds the app:

1. `node:22-alpine` builder, copy the workspace manifests, `pnpm install --frozen-lockfile`.
2. Copy `packages` and `apps/landing-web`, then `pnpm --filter @evcp/landing-web build`.
3. `node:22-alpine` runtime, copy the Next standalone output plus `.next/static` and
   `public`, run as a non-root user, `CMD ["node", "apps/landing-web/server.js"]`.

`next.config.ts` sets `output: "standalone"` and `outputFileTracingRoot` to the monorepo
root, which is required for the tracer to follow workspace symlinks.

Railway builds this Dockerfile from the repository root. It injects `PORT`, which the
Next standalone server already honours, so the service needs no environment variables and
no attached resources. The health check path is `/`.

`docker/docker-compose.yml` and `docker/Caddyfile` are untouched; the private-server
stack keeps its current routing.

## Testing

- `tests/unit/landing-web-render-smoke.test.mjs` — renders every section through
  `renderToStaticMarkup` with browser globals stubbed, mirroring
  `tests/unit/creator-web-render-smoke.test.mjs`, to catch render-time throws that
  `tsc` and `next build` miss.
- `tests/unit/landing-web-content.test.mjs` — asserts content invariants: every section
  has a heading, every navigation anchor resolves to a section that exists, and every
  external link is absolute and https.
- `tests/unit/design-system-governance.test.mjs` — asserts the amended
  `check-design-system.mjs` still rejects a hex literal inside `apps/landing-web/src`,
  accepts the marketing stylesheet import, and rejects an `app/[lang]/globals.css`
  containing anything beyond the permitted imports and `@source` directives.
- `tests/unit/landing-web-i18n.test.mjs` — enumerates every module under
  `apps/landing-web/src/features` from disk (plus the cross-cutting language-switcher and
  metadata content in `shared/`) and asserts each provides copy for both locales with
  matching shapes, that Thai copy contains Thai script and English copy does not, and that
  neither locale claims a licence or an approval gate the product does not have. It also
  covers the locale-segmented route tree, the `/` → `/th` redirect, and per-locale
  `sitemap.ts`/metadata hreflang alternates.
- `tests/unit/ui-fonts.test.mjs` — asserts every bundled font file is declared with a
  `@font-face` using `woff2` and `font-display: swap`, and that the shared sans stack
  resolves Latin before Thai (landing-web consumes this stack via `marketing.css`).

## Risks

- **Next.js is new to this repository.** It brings its own build and lint conventions.
  Mitigated by keeping the app dependency-free at runtime and by the app being
  deployment-isolated: if it breaks, nothing in the platform stack is affected.
- **Root `build` and `typecheck` now include a Next build**, which lengthens CI. Accepted;
  the app is small and `next build` caches.
- **Light premium is harder to make striking than dark.** Mitigated by concentrating the
  effect in typography, spacing, and a single signature gradient rather than spreading
  weak effects across every section.
