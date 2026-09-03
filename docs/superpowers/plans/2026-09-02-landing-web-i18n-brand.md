# Landing Web — Bilingual TH/EN, Real Fonts, Real Logo

> **Note (2026-09-03):** The implementation described here moved out of this monorepo to
> `horizonxlabs/horizon-website` on 2026-09-03. This document is kept as the historical
> plan record and no longer describes the current location of the code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing site bilingual with Thai as the default language, render both scripts in fonts that are actually loaded, and use the real Horizon logo instead of a text wordmark.

**Architecture:** Next 16 App Router `app/[lang]/` routing with `generateStaticParams` prerendering both locales; `proxy.ts` redirects `/` to `/th`. Copy stays beside its section but becomes `Record<Locale, …>`, so a missing translation is a typecheck failure rather than a blank on a public page. Locale is passed as a prop from `page.tsx`/`layout.tsx` down to sections — deliberately *not* read via `next/root-params` — so sections stay synchronous and remain testable with `renderToStaticMarkup`.

**Tech Stack:** Next.js 16.3.4, React 19.2.8, Tailwind v4, `next/font/google` (Inter), self-hosted LINE Seed Sans TH woff2 already in `packages/ui/fonts/`, Node's test runner via `tsx`.

**Predecessor:** `docs/superpowers/plans/2026-09-02-landing-web.md` and `docs/superpowers/specs/2026-09-02-landing-web-design.md`. The spec's "No internationalisation. English only." non-goal is **superseded by this plan** and must be updated (Task 5).

## Global Constraints

- **Read `apps/landing-web/AGENTS.md` before writing any Next.js code.** This Next version differs from model training data; the authoritative guides are in `apps/landing-web/node_modules/next/dist/docs/`. The i18n guide is `01-app/02-guides/internationalization.md`.
- **Zero client components**, enforced by a test walking `src/app`, `src/shared`, `src/features`. No `"use client"`. The language switcher must be plain anchors.
- Locales are exactly `th` and `en`. `th` is the default. `type Locale = "th" | "en"`.
- No hex/`rgb()`/`hsl()` colour literals, no `style={{ }}`, no Tailwind palette utilities (`bg-slate-900`, `bg-white`, `text-black`), no arbitrary values (`p-[13px]`) anywhere under `apps/landing-web/src`.
- Shape utilities limited to `rounded-card`, `rounded-control`, `rounded-pill`, `shadow-card`.
- `apps/landing-web/src/app/**/globals.css` may contain only comments, `@import "@evcp/ui/<name>.css";` and `@source` directives. `layout.tsx` must keep its `import "./globals.css";` statement verbatim — the design-system checker grants an exact-path, exact-substring exemption.
- **Honesty constraints carry over to the Thai copy.** No approval-gate claim (ADR-004 is *Proposed*, unimplemented). No unqualified "data never leaves your network" — AI generation egresses to configured providers. No numeric quota or SLA that the code does not enforce; the enforced quota is `quotaTokens`, not spend.
- The repository has **no `LICENSE`**. Neither language may state or imply one.
- New files capped at 400 lines.
- **Never run `pnpm format` with no arguments** — it reformats all 586 repo files. Format only files you touch.
- **Do not gate on a bare `pnpm check`** — it is already red on `main` at `apps/creator-web/src/features/workspace/WorkspacePage.tsx:276`, pre-existing and out of scope.
- Add new commits; never amend. Stage only files you touch; never `git add -A`.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Key Design Decisions

**URL shape changed from what was discussed.** In chat I proposed `/` serving Thai with no prefix. With `app/[lang]/`, every route needs the segment, so prefix-less Thai requires an internal rewrite — which makes both `/` and `/th` serve identical content under two URLs, splitting SEO signal unless canonical tags paper over it. This plan instead redirects `/` → `/th` (308) via `proxy.ts`. Canonicals are unambiguous, `hreflang` is clean, and the cost is one hop on the root URL only. Both locales are statically prerendered.

**Locale is a prop, not `next/root-params`.** Next 16 offers `import { lang } from "next/root-params"` to read the root segment anywhere without prop drilling, and it is the idiomatic choice. We do not use it in sections: root-param getters are async, which would force every section to become an async component, and `renderToStaticMarkup` — the basis of every render-smoke test in this repo — cannot render async components. `page.tsx` and `layout.tsx` already receive `params`; they resolve the locale once and pass it down one level. Sections stay synchronous and testable.

**Font stack is inverted at the root.** `packages/ui/theme.css` currently orders Thai families before Latin ones, so on any machine with a Thai system font installed (every Mac has Thonburi) Latin text renders from a Thai face. Font fallback is per-glyph, so listing Latin first and Thai second gives Inter for Latin and LINE Seed for Thai *within the same sentence*. This fixes all four apps, not just landing.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `packages/ui/fonts.css` | `@font-face` declarations for the five bundled LINE Seed Sans TH weights |
| `apps/landing-web/src/app/[lang]/` | Locale-segmented route tree (moved from `src/app/`) |
| `apps/landing-web/src/proxy.ts` | Redirect `/` → `/th` |
| `apps/landing-web/src/shared/locale.ts` | `Locale`, `LOCALES`, `DEFAULT_LOCALE`, `isLocale` |
| `apps/landing-web/src/shared/language-switcher.tsx` | TH ⇄ EN anchors, no client JS |
| `apps/landing-web/public/horizon-logo.png` | Real logo, copied from `apps/creator-web/public/` |
| `tests/unit/landing-web-i18n.test.mjs` | Locale completeness, script separation, routing contract |
| `tests/unit/ui-fonts.test.mjs` | `@font-face` coverage and Latin-first ordering |

**Modified:** `packages/ui/theme.css` (font order), `packages/ui/styles.css` (import `fonts.css`), `packages/ui/package.json` (export `fonts.css`), all nine `apps/landing-web/src/features/*/*-content.ts`, all nine `*-section.tsx`, `shared/site-nav.tsx`, `shared/site-footer.tsx`, `shared/site-config.ts`, `shared/action-button.tsx` (no change expected — verify), the three landing test files, `docs/superpowers/specs/2026-09-02-landing-web-design.md`, `README.md`.

---

### Task 1: Fonts and logo

Fonts and the logo are independent of i18n and fix a defect affecting all four apps, so they land first and are verifiable on the English site before routing changes.

**Files:**
- Create: `packages/ui/fonts.css`, `apps/landing-web/public/horizon-logo.png`, `tests/unit/ui-fonts.test.mjs`
- Modify: `packages/ui/theme.css`, `packages/ui/styles.css`, `packages/ui/package.json`, `apps/landing-web/src/app/layout.tsx`, `apps/landing-web/src/shared/site-nav.tsx`, `apps/landing-web/src/shared/site-footer.tsx`, `packages/ui/marketing.css`

**Interfaces produced:** `@evcp/ui/fonts.css` importable; `--evcp-font-sans` resolving Latin-first; the `Inter` variable font exposed as a CSS custom property on `<html>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui-fonts.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const fonts = readFileSync("packages/ui/fonts.css", "utf8");
const theme = readFileSync("packages/ui/theme.css", "utf8");

test("every bundled font file is actually declared with @font-face", () => {
  const files = readdirSync("packages/ui/fonts").filter((f) => f.endsWith(".woff2"));
  assert.ok(files.length > 0, "no bundled fonts found");
  for (const file of files) {
    assert.ok(fonts.includes(file), `${file} is bundled but never declared in fonts.css`);
  }
});

test("declared faces use woff2 and swap display", () => {
  const faces = fonts.match(/@font-face/g) ?? [];
  assert.equal(faces.length, readdirSync("packages/ui/fonts").filter((f) => f.endsWith(".woff2")).length);
  assert.ok(fonts.includes("font-display: swap"), "faces must not block first paint");
});

test("the sans stack resolves Latin before Thai", () => {
  const stack = theme.match(/--evcp-font-sans:\s*([^;]+);/)?.[1] ?? "";
  const latin = stack.indexOf("--evcp-font-latin");
  const thai = stack.indexOf("--evcp-font-thai");
  assert.ok(latin !== -1 && thai !== -1, "both stacks must be referenced");
  assert.ok(
    latin < thai,
    "Latin must come first: font fallback is per-glyph, so a Thai-first stack renders English text from a Thai face"
  );
});

test("the landing app ships the real logo, not a text wordmark", () => {
  const nav = readFileSync("apps/landing-web/src/shared/site-nav.tsx", "utf8");
  assert.match(nav, /horizon-logo\.png/);
  assert.match(nav, /alt=/, "the logo must carry alt text");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `node --import tsx --test tests/unit/ui-fonts.test.mjs`
Expected: FAIL — `packages/ui/fonts.css` does not exist.

- [ ] **Step 3: Declare the bundled Thai faces**

Create `packages/ui/fonts.css`. The five files in `packages/ui/fonts/` are `LINESeedSansTH_W_Th.woff2` (250), `_Rg` (400), `_Bd` (700), `_He` (800), `_XBd` (900).

```css
/* The LINE Seed Sans TH files have been bundled in packages/ui/fonts/ since the design system
   was created, but nothing ever declared them — so Thai text fell through to whatever the OS
   provided (Thonburi on macOS). These declarations make the intended face actually load.
   Licence: packages/ui/fonts/LINE_SEED_LICENSE.md */
@font-face {
  font-family: "LINE Seed Sans TH";
  src: url("./fonts/LINESeedSansTH_W_Th.woff2") format("woff2");
  font-weight: 250;
  font-style: normal;
  font-display: swap;
}
```

Repeat for `_Rg` (400), `_Bd` (700), `_He` (800), `_XBd` (900), same family name.

- [ ] **Step 4: Wire it in and invert the stack**

In `packages/ui/styles.css`, add `@import "./fonts.css";` next to the existing `@import "./theme.css";`.

In `packages/ui/package.json` `exports`, add `"./fonts.css": "./fonts.css"`.

In `packages/ui/theme.css`, change the composed stack — this is the one-line fix for all four apps:

```css
/* Latin first: font fallback is per-glyph, so this renders Latin from Inter and Thai from
   LINE Seed within the same sentence. Thai-first meant English text rendered from a Thai
   face on any machine with one installed. */
--evcp-font-sans: var(--evcp-font-latin), var(--evcp-font-thai), sans-serif;
```

- [ ] **Step 5: Self-host Inter for the landing app**

In `apps/landing-web/src/app/layout.tsx`:

```tsx
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
```

Put `className={inter.variable}` on `<html>`. Then in `packages/ui/marketing.css`, prefer the loaded face when present:

```css
:root {
  --evcp-font-latin: var(--font-inter), Inter, "SF Pro Text", "Segoe UI", system-ui;
}
```

If `next/font/google` cannot reach the network during the build, stop and report BLOCKED with the error rather than silently falling back — a build-time network dependency is a real deployment risk and the controller needs to decide.

- [ ] **Step 6: Use the real logo**

Copy the asset: `cp apps/creator-web/public/horizon-logo.png apps/landing-web/public/horizon-logo.png` (984×254, a horizontal lockup).

In `site-nav.tsx`, replace the text wordmark with `next/image`, keeping the link to `#top`:

```tsx
import Image from "next/image";
…
<a href="#top" className="flex items-center">
  <Image src="/horizon-logo.png" alt={siteConfig.name} width={984} height={254} priority className="h-7 w-auto" />
</a>
```

`width`/`height` are the intrinsic dimensions and prevent layout shift; `h-7 w-auto` sets the rendered size. Use the same image in the footer at a smaller height if it reads well; otherwise leave the footer text as it is and say why.

- [ ] **Step 7: Verify, including by eye**

```bash
node --import tsx --test tests/unit/ui-fonts.test.mjs
pnpm test:unit
pnpm --filter @evcp/landing-web build && pnpm --filter @evcp/creator-web build && pnpm --filter @evcp/admin-web build && pnpm --filter @evcp/app-store-pwa build
node scripts/quality/check-design-system.mjs apps/landing-web/src/shared/site-nav.tsx apps/landing-web/src/app/layout.tsx
```

Then build, serve and screenshot. Next's standalone output omits `.next/static`, so copy it in first or the page serves unstyled:

```bash
rm -rf apps/landing-web/.next && pnpm --filter @evcp/landing-web build
cp -r apps/landing-web/.next/static apps/landing-web/.next/standalone/apps/landing-web/.next/static
cd apps/landing-web/.next/standalone/apps/landing-web && node server.js &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --virtual-time-budget=9000 --window-size=1440,900 \
  --screenshot=/tmp/fonts.png http://127.0.0.1:3000/
```

**Read the screenshot** and report what you see: does the headline render in Inter (a neutral grotesque) rather than the previous quirky face, and is the logo lockup visible and correctly sized in the nav? Stop the server.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/fonts.css packages/ui/theme.css packages/ui/styles.css packages/ui/package.json packages/ui/marketing.css apps/landing-web/public/horizon-logo.png apps/landing-web/src/app/layout.tsx apps/landing-web/src/shared/site-nav.tsx tests/unit/ui-fonts.test.mjs
git commit -m "feat(ui): load bundled Thai faces, order Latin first, use the real logo"
```

---

### Task 2: Locale routing skeleton

Move the route tree under `[lang]` and prove both URLs render, **before** touching any copy. English content stays as-is; Thai will render English text at this stage. Keeping these separate means a routing failure and a translation failure cannot be confused.

**Files:**
- Create: `apps/landing-web/src/shared/locale.ts`, `apps/landing-web/src/proxy.ts`, `tests/unit/landing-web-i18n.test.mjs`
- Move: `src/app/{layout.tsx,page.tsx,globals.css,sitemap.ts,robots.ts}` → `src/app/[lang]/` (keep `globals.css` beside the layout that imports it)
- Modify: `scripts/quality/check-design-system.mjs` (the `globals.css` exemption path moves)

**Interfaces produced:** `type Locale = "th" | "en"`, `LOCALES`, `DEFAULT_LOCALE = "th"`, `isLocale(v): v is Locale`; routes `/th` and `/en` prerendered; `/` redirecting to `/th`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/landing-web-i18n.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const base = "../../apps/landing-web/src";
const { LOCALES, DEFAULT_LOCALE, isLocale } = await import(`${base}/shared/locale.ts`);

test("Thai is the default locale and both locales are supported", () => {
  assert.deepEqual([...LOCALES].sort(), ["en", "th"]);
  assert.equal(DEFAULT_LOCALE, "th");
  assert.ok(isLocale("th") && isLocale("en"));
  assert.ok(!isLocale("fr"));
});

test("the route tree is locale-segmented", () => {
  for (const file of ["layout.tsx", "page.tsx", "globals.css", "sitemap.ts", "robots.ts"]) {
    assert.ok(
      existsSync(`apps/landing-web/src/app/[lang]/${file}`),
      `app/[lang]/${file} is missing`
    );
  }
  assert.ok(!existsSync("apps/landing-web/src/app/page.tsx"), "the un-segmented page must be gone");
});

test("both locales are prerendered", () => {
  const layout = readFileSync("apps/landing-web/src/app/[lang]/layout.tsx", "utf8");
  assert.match(layout, /generateStaticParams/);
  for (const locale of LOCALES) assert.ok(layout.includes(`"${locale}"`) || layout.includes(`'${locale}'`));
});

test("the bare root redirects to the default locale", () => {
  const proxy = readFileSync("apps/landing-web/src/proxy.ts", "utf8");
  assert.match(proxy, /\/th/);
  assert.match(proxy, /redirect/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-i18n.test.mjs`
Expected: FAIL — `shared/locale.ts` does not resolve.

- [ ] **Step 3: Define the locale module**

`apps/landing-web/src/shared/locale.ts`:

```ts
export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Move the route tree**

`git mv` each of `layout.tsx`, `page.tsx`, `globals.css`, `sitemap.ts`, `robots.ts` from `src/app/` into `src/app/[lang]/`. Using `git mv` keeps the history readable.

Update `scripts/quality/check-design-system.mjs`: `LANDING_CSS_ENTRY` becomes `apps/landing-web/src/app/[lang]/globals.css`. Its `@source` directive may need adjusting for the extra directory level — verify Tailwind still emits the landing utilities by grepping the built CSS for `evcp-hero-gradient`.

- [ ] **Step 5: Make the layout locale-aware**

In `app/[lang]/layout.tsx`. `params` is async in this Next version — read the guide if unsure.

```tsx
import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/shared/locale";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={inter.variable}>
      <body className="bg-page text-body min-h-screen antialiased">
        <SiteNav locale={lang} />
        {children}
        <SiteFooter locale={lang} />
      </body>
    </html>
  );
}
```

`SiteNav` and `SiteFooter` take a `locale` prop now; they may ignore it until Task 3.

`page.tsx` likewise awaits `params`, validates, and passes `locale` to each section. Sections accept the prop and ignore it for now — do not make them async.

- [ ] **Step 6: Redirect the bare root**

`apps/landing-web/src/proxy.ts`. **This file is called `proxy`, not `middleware`, in this Next version** — confirm against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` before writing it.

```ts
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES } from "@/shared/locale";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) return NextResponse.next();
  request.nextUrl.pathname = `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.redirect(request.nextUrl, 308);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"]
};
```

The matcher must exclude `_next` and anything with a file extension, or the redirect will swallow `/sitemap.xml`, `/robots.txt` and the logo.

- [ ] **Step 7: Verify routing end to end**

Build, serve, and confirm with real requests — put the output in your report:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://127.0.0.1:3000/     # expect 308 -> /th
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/th                   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/en                   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/sitemap.xml          # expect 200, NOT redirected
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/horizon-logo.png     # expect 200
curl -s http://127.0.0.1:3000/th | grep -o '<html lang="[a-z]*"'                    # expect th
curl -s http://127.0.0.1:3000/en | grep -o '<html lang="[a-z]*"'                    # expect en
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(landing-web): add locale-segmented routing with Thai as default"
```

---

### Task 3: Localize every content module

**Files:** all nine `apps/landing-web/src/features/*/*-content.ts` and their `*-section.tsx`; `shared/site-config.ts`; `tests/unit/landing-web-content.test.mjs`; `tests/unit/landing-web-i18n.test.mjs`

**Interfaces produced:** every content export becomes `Record<Locale, …>`; every section accepts `{ locale }: { locale: Locale }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/landing-web-i18n.test.mjs`. This is the test that makes a missing translation impossible to ship:

```js
const THAI = /[฀-๿]/;

const modules = {
  hero: await import(`${base}/features/hero`),
  surfaces: await import(`${base}/features/surfaces`),
  lifecycle: await import(`${base}/features/lifecycle`),
  governance: await import(`${base}/features/governance`),
  selfHost: await import(`${base}/features/self-host`),
  openSource: await import(`${base}/features/open-source`),
  faq: await import(`${base}/features/faq`),
  finalCta: await import(`${base}/features/final-cta`)
};

function copyOf(mod) {
  return Object.entries(mod).find(([name]) => name.endsWith("Content"))?.[1];
}

test("every section provides copy for both locales", () => {
  for (const [name, mod] of Object.entries(modules)) {
    const content = copyOf(mod);
    assert.ok(content, `${name} exports no *Content`);
    for (const locale of LOCALES) {
      assert.ok(content[locale], `${name} is missing ${locale} copy`);
    }
    assert.deepEqual(
      Object.keys(content.th).sort(),
      Object.keys(content.en).sort(),
      `${name}: the two locales have different shapes`
    );
  }
});

test("Thai copy is Thai and English copy is not", () => {
  for (const [name, mod] of Object.entries(modules)) {
    const content = copyOf(mod);
    assert.match(JSON.stringify(content.th), THAI, `${name}: th copy contains no Thai script`);
    assert.doesNotMatch(JSON.stringify(content.en), THAI, `${name}: en copy contains Thai script`);
  }
});

test("neither language claims a licence or an approval gate", () => {
  for (const mod of Object.values(modules)) {
    const all = JSON.stringify(copyOf(mod));
    assert.doesNotMatch(all, /licen[sc]e/i);
    assert.doesNotMatch(all, /\d+ of \d+ approvals/);
  }
});
```

Delete the now-superseded English-only assertions in `landing-web-content.test.mjs` that forbid Thai codepoints — they were correct for a monolingual site and are wrong now. Keep every other invariant there, adapting it to index by locale.

- [ ] **Step 2: Run and verify failure**

Expected: FAIL — content modules are flat objects, so `content.th` is undefined.

- [ ] **Step 3: Convert the content modules**

For each of the nine, wrap the existing English copy under an `en` key and add `th`. Example shape:

```ts
import type { Locale } from "@/shared/locale";

export const heroContent: Record<Locale, HeroCopy> = {
  th: {
    eyebrow: "โอเพนซอร์ส · ติดตั้งบนเซิร์ฟเวอร์ของคุณเอง",
    headline: "ส่งมอบซอฟต์แวร์ภายในองค์กรด้วยความเร็วของ AI — ภายใต้การกำกับดูแลระดับองค์กร",
    …
  },
  en: { /* the existing copy, unchanged */ }
};
```

**Translation guidance.** This is public marketing copy for an open-source project; a literal translation will read badly and may overclaim. Specific traps:

- "governed deployment" → convey *กำกับดูแล/ควบคุมได้* — not ปกครอง
- "rollback safety" → the check that a bad migration cannot strand an app; describe the property, do not transliterate
- "guardrails", "quota" → prefer natural Thai over English loanwords where a clear Thai term exists, but keep well-understood technical terms (PRD, container, PWA, SSO, OIDC, SAML) as-is rather than inventing translations
- Keep proper nouns untranslated: Horizon, Postgres, Redis, MinIO, Keycloak, LiteLLM, OpenBao, Caddy, Admin Console, Creator App, App Store PWA
- `selfHostContent.command` (`pnpm dev:setup`) and the service list are identical in both locales

Carry the honesty constraints verbatim into Thai: pre-publish checks are rollback-safety validation only; nothing about a reviewer approval gate; the network claim keeps its AI-provider qualifier; quotas are token-based.

- [ ] **Step 4: Thread the locale through the sections**

Each section takes `{ locale }: { locale: Locale }` and selects its copy:

```tsx
export function SurfacesSection({ locale }: { locale: Locale }) {
  const copy = surfacesContent[locale];
  …
}
```

Keep them synchronous — do not use `next/root-params`, which is async and would break `renderToStaticMarkup` in the tests.

- [ ] **Step 5: Verify and commit**

Run both landing test files plus `pnpm test:unit`, then commit.

---

### Task 4: Language switcher and per-locale SEO

**Files:**
- Create: `apps/landing-web/src/shared/language-switcher.tsx`
- Modify: `shared/site-nav.tsx`, `app/[lang]/layout.tsx`, `app/[lang]/sitemap.ts`, `app/[lang]/robots.ts`, `tests/unit/landing-web-i18n.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
test("the switcher links to the other locale and marks the current one", () => {
  const th = renderToStaticMarkup(React.createElement(LanguageSwitcher, { locale: "th" }));
  assert.match(th, /href="\/en"/);
  assert.match(th, /aria-current="true"/);
  const en = renderToStaticMarkup(React.createElement(LanguageSwitcher, { locale: "en" }));
  assert.match(en, /href="\/th"/);
});

test("each locale declares hreflang alternates for both languages", () => {
  const layout = readFileSync("apps/landing-web/src/app/[lang]/layout.tsx", "utf8");
  assert.match(layout, /alternates/);
  assert.match(layout, /languages/);
});

test("the sitemap lists both locales", () => {
  const sitemap = readFileSync("apps/landing-web/src/app/[lang]/sitemap.ts", "utf8");
  for (const locale of LOCALES) assert.ok(sitemap.includes(locale));
});
```

- [ ] **Step 2: Build the switcher — no client JavaScript**

Two anchors, current locale marked and non-interactive. It must not introduce a `"use client"` file; the zero-client-component test enforces this.

- [ ] **Step 3: Per-locale metadata**

`generateMetadata` returns a localized title and description, `metadataBase` from `siteUrl`, `alternates.languages` mapping `th` → `/th` and `en` → `/en`, and `openGraph.locale`. Thai and English titles must differ.

- [ ] **Step 4: Sitemap and robots**

Sitemap emits an entry per locale with `alternates.languages`. Robots keeps a single `Sitemap:` line at the site root.

- [ ] **Step 5: Verify both locales serve and commit**

Confirm by curl that `/th` and `/en` each carry `hreflang` alternates pointing at the other, and that the switcher's link works.

---

### Task 5: Documentation, spec correction, and full verification

**Files:** `docs/superpowers/specs/2026-09-02-landing-web-design.md`, `README.md`

- [ ] **Step 1: Correct the spec**

Its Non-goals say "No internationalisation. English only. `[locale]` segments can be added later." That is now false. Replace it with what shipped: two locales, Thai default, `/` redirecting to `/th`, locale passed as a prop rather than read from `next/root-params`, and why. Also correct the Page Structure section, which describes English copy.

- [ ] **Step 2: Update the README**

Note that the landing site is bilingual, that `/` redirects to `/th`, and that adding a locale means adding it to `LOCALES` plus a translation in each content module — the typecheck will list what is missing.

- [ ] **Step 3: Full gates**

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm check:frontend-architecture
pnpm --filter @evcp/landing-web build
node scripts/quality/check-design-system.mjs apps/landing-web/src/**/*.tsx apps/landing-web/src/**/*.ts
```

- [ ] **Step 4: Visual verification of both locales**

Build, serve, screenshot `/th` and `/en` at 1440×900, **read both images**, and report: does Thai render in LINE Seed rather than a system fallback, does the logo appear, does the switcher show, and does the Thai text set without clipping or awkward wrapping? Thai has taller ascenders and no spaces between words — check line-height and headline wrapping specifically.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage.** Bilingual routing → Task 2. Thai default → Task 2 (`DEFAULT_LOCALE`, proxy redirect). Translated copy → Task 3. Switcher → Task 4. SEO/hreflang → Task 4. Fonts → Task 1. Logo → Task 1. Spec and README correction → Task 5. Zero client components → constrained in Task 4 and enforced by the pre-existing test. Honesty constraints → carried into Task 3's translation guidance and asserted by a test.

**Type consistency.** `Locale` is defined once in Task 2 and consumed by Tasks 3 and 4. `LOCALES`/`DEFAULT_LOCALE`/`isLocale` keep their names throughout. Every content export becomes `Record<Locale, …>` in Task 3, and every section's prop is `{ locale }` — the same name in the layout, the page and the switcher.

**Riskiest step.** Task 1 Step 5: `next/font/google` fetches at build time. If the Docker build has no network the image build fails, which would only surface at Task 1's container check or on Railway. The task tells the implementer to report BLOCKED rather than paper over it, so the controller can decide between a vendored font file and the network dependency.

**Known ordering constraint.** Task 2 moves `globals.css` into `app/[lang]/`, which invalidates the exact-path exemption in `check-design-system.mjs`. The move and the checker update must land in the same commit or the gate fails mid-task.
