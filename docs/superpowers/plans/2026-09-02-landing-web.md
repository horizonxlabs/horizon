# Landing Web Implementation Plan

> **Note (2026-09-03):** The implementation described here moved out of this monorepo to
> `horizonxlabs/horizon-website` on 2026-09-03. This document is kept as the historical
> plan record and no longer describes the current location of the code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, server-rendered marketing site for Horizon at `apps/landing-web`, styled from the real product design tokens and deployable to Railway on its own.

**Architecture:** A Next.js 16 App Router application inside the existing pnpm workspace. It depends on `@evcp/ui` for tokens and on a new `packages/ui/marketing.css` for the handful of marketing-only shapes. Content is typed data colocated with the section that renders it; sections are server components; exactly one client component drives scroll reveal. The repository quality gate is extended to cover the new app rather than left blind to it.

**Tech Stack:** Next.js 16.3.4, React 19.2.8, TypeScript, Tailwind v4 via `@tailwindcss/postcss`, `lucide-react`, Node's built-in test runner through `tsx`, Docker for Railway.

**Spec:** `docs/superpowers/specs/2026-09-02-landing-web-design.md`

## Global Constraints

- Next.js `16.3.4`; React and React DOM `^19.2.8`; Node `>=22.19.0`.
- Dev port `4103`. Never reuse 4100/4101/4102 (admin/creator/store) or 3100 (API).
- All copy is English. No Thai strings anywhere in `apps/landing-web`.
- **No raw colour values** in `apps/landing-web/src` — no `#hex`, no `rgb()/rgba()/hsl()/hsla()`. Colour literals belong only in `packages/ui/theme.css` layer 1.
- **No inline styles** — `style={{ … }}` is rejected by `check-design-system.mjs`.
- **No Tailwind palette utilities** (`bg-slate-900`, `text-blue-600`, `bg-white`, `text-black`, `bg-transparent`) and **no arbitrary values** (`p-[13px]`). Use the semantic utilities `@evcp/ui` generates: `bg-page`, `bg-surface`, `bg-surface-muted`, `bg-primary`, `bg-primary-strong`, `bg-primary-soft`, `text-body`, `text-muted`, `text-primary`, `text-accent`, `text-on-primary`, `border-border`, `border-border-soft`.
- **Shape utilities are limited to** `rounded-card`, `rounded-control`, `rounded-pill`, `shadow-card`. Anything else (`rounded-full`, `shadow-lg`, `rounded-2xl`) is rejected. Marketing-only shapes come from named classes in `packages/ui/marketing.css`.
- **Source roots inside `apps/landing-web/src` may only be** `app`, `features`, or `shared`. Cross-boundary imports use `@/` aliases; relative imports are allowed only within the same feature directory. `shared` must never import from `features` or `app`. Features are consumed through their `index.ts`.
- **New files are capped at 400 lines** by `scripts/quality/check-changed.mjs`.
- Repository URL, used verbatim: `https://github.com/0xlabsTeam/EnterpriseVibeCodingPlatform`
- The repository has **no `LICENSE` file**. Do not state or imply a licence anywhere on the site.
- Do not modify `docker/docker-compose.yml`, `docker/Caddyfile`, `docker/Caddyfile.release`, or anything under `apps/platform-api`, `apps/admin-web`, `apps/creator-web`, `apps/app-store-pwa`.
- Run `node --import tsx --test tests/unit/<file>.test.mjs` for a single unit test; the suite-wide runner sets `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json`, so pass that variable when running a single file that imports `.tsx` sources.

---

## File Structure

**Created:**

| Path                                                                                                      | Responsibility                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/ui/marketing.css`                                                                               | Marketing-only tokens and the named classes built from them                                                        |
| `apps/landing-web/package.json`                                                                           | Workspace manifest, scripts, dependencies                                                                          |
| `apps/landing-web/tsconfig.json`                                                                          | Extends `tsconfig.base.json`, defines the `@/*` alias                                                              |
| `apps/landing-web/next.config.ts`                                                                         | `output: "standalone"`, `outputFileTracingRoot`                                                                    |
| `apps/landing-web/postcss.config.mjs`                                                                     | `@tailwindcss/postcss`                                                                                             |
| `apps/landing-web/src/app/globals.css`                                                                    | Imports `@evcp/ui` stylesheets, declares Tailwind sources                                                          |
| `apps/landing-web/src/app/layout.tsx`                                                                     | HTML shell, metadata, nav and footer                                                                               |
| `apps/landing-web/src/app/page.tsx`                                                                       | Section composition only                                                                                           |
| `apps/landing-web/src/app/sitemap.ts`, `robots.ts`                                                        | Crawl metadata                                                                                                     |
| `apps/landing-web/src/shared/*`                                                                           | `site-config`, `content-types`, `section`, `section-heading`, `action-button`, `reveal`, `site-nav`, `site-footer` |
| `apps/landing-web/src/features/{hero,surfaces,lifecycle,governance,self-host,open-source,faq,final-cta}/` | One section each: `index.ts`, `*-section.tsx`, `*-content.ts`                                                      |
| `docker/landing-web.Dockerfile`                                                                           | Multi-stage build producing the standalone server                                                                  |
| `tests/unit/landing-web-contract.test.mjs`                                                                | Workspace and config contract                                                                                      |
| `tests/unit/landing-web-content.test.mjs`                                                                 | Content invariants                                                                                                 |
| `tests/unit/landing-web-render-smoke.test.mjs`                                                            | Static render of every section                                                                                     |

**Modified:**

| Path                                              | Change                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/ui/package.json`                        | Add the `./marketing.css` export                                                          |
| `scripts/quality/check-design-system.mjs`         | Cover `apps/landing-web/src`; approve `marketing.css`; conditionally exempt `globals.css` |
| `tests/unit/design-system-governance.test.mjs`    | Add landing-web governance cases                                                          |
| `tsconfig.test.json`                              | `@/*` becomes an ordered array including landing-web                                      |
| `package.json`                                    | Add `dev:landing`                                                                         |
| `.gitignore`, `.prettierignore`, `.oxlintrc.json` | Ignore `.next`                                                                            |

---

### Task 1: Marketing tokens and design-system coverage

The quality gate must cover the new app _before_ the app exists, so nothing can be written into an unchecked directory.

**Files:**

- Create: `packages/ui/marketing.css`
- Modify: `packages/ui/package.json`
- Modify: `scripts/quality/check-design-system.mjs`
- Test: `tests/unit/design-system-governance.test.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces: the stylesheet `@evcp/ui/marketing.css`, exposing CSS custom properties `--evcp-gradient-hero`, `--evcp-shadow-glow`, `--evcp-radius-hero` and the classes `.evcp-hero-gradient`, `.evcp-glow-card`, `.evcp-reveal`, `.evcp-reveal-visible`. Later tasks apply these class names via `className`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/design-system-governance.test.mjs`. The existing `runCheck` helper writes into `apps/admin-web/src/__govtest__`; add a sibling helper for the landing app, then the cases.

```js
function runLandingCheck(relFile, contents) {
  const root = process.cwd();
  const dir = join(root, "apps/landing-web/src/app/__govtest__");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, relFile);
  writeFileSync(file, contents, "utf8");
  try {
    execFileSync("node", ["scripts/quality/check-design-system.mjs", file], { cwd: root });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? "") + String(error.stderr ?? "") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("landing-web sources are governed like every other app surface", () => {
  const result = runLandingCheck("Bad.tsx", 'export const x = <div className="bg-blue-500" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("landing-web may import the marketing stylesheet", () => {
  const result = runLandingCheck("Ok.tsx", 'import "@evcp/ui/marketing.css";\n');
  assert.equal(result.ok, true);
});

test("an app-local stylesheet in landing-web is still rejected", () => {
  const result = runLandingCheck("extra.css", ".x { display: flex; }\n");
  assert.equal(result.ok, false);
  assert.match(result.output, /app-local stylesheet/i);
});
```

The `globals.css` exemption is path-exact, so it needs its own helper that writes the real path. Add it too:

```js
function runGlobalsCheck(contents) {
  const root = process.cwd();
  const dir = join(root, "apps/landing-web/src/app");
  const file = join(dir, "globals.css");
  const existed = existsSync(file);
  const previous = existed ? readFileSync(file, "utf8") : null;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, contents, "utf8");
  try {
    execFileSync("node", ["scripts/quality/check-design-system.mjs", file], { cwd: root });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: String(error.stdout ?? "") + String(error.stderr ?? "") };
  } finally {
    if (existed) writeFileSync(file, previous, "utf8");
    else rmSync(file, { force: true });
  }
}

test("globals.css passes when it only imports @evcp/ui and declares sources", () => {
  const result = runGlobalsCheck(
    '/* entry */\n@import "@evcp/ui/styles.css";\n@import "@evcp/ui/marketing.css";\n@source "../";\n'
  );
  assert.equal(result.ok, true);
});

test("globals.css fails when it declares its own styling", () => {
  const result = runGlobalsCheck('@import "@evcp/ui/styles.css";\n.hero { color: red; }\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /globals\.css/i);
});
```

Extend the existing import list at the top of the test file so `existsSync` and `readFileSync` are available:

```js
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/unit/design-system-governance.test.mjs`
Expected: FAIL. The landing cases pass a file outside `APP_SRC_DIRS`, so the checker exits 0 and the "rejected" assertions fail; the `globals.css` success case fails because the file is currently treated as an app-local stylesheet.

- [ ] **Step 3: Create `packages/ui/marketing.css`**

```css
/* Marketing surface tokens — layer 2, derived only from the layer 1 refs in theme.css.
   Kept out of theme.css so the product design system is not carrying values used on
   exactly one page. Classes follow the precedent of creator-project-switcher.css:
   named classes rather than Tailwind utilities, so the design-system check's shape
   allowlist (shadow-card, rounded-card/control/pill) does not have to be loosened. */
@import "./theme.css";

:root {
  --evcp-gradient-hero:
    radial-gradient(
      60% 50% at 18% 0%,
      color-mix(in oklab, var(--ref-sky-400) 22%, transparent) 0%,
      transparent 70%
    ),
    radial-gradient(
      55% 45% at 82% 8%,
      color-mix(in oklab, var(--ref-blue-100) 85%, transparent) 0%,
      transparent 72%
    ),
    linear-gradient(180deg, var(--ref-white) 0%, var(--ref-slate-50) 100%);
  --evcp-shadow-glow:
    0 1px 2px color-mix(in oklab, var(--ref-slate-900) 5%, transparent),
    0 24px 64px color-mix(in oklab, var(--ref-blue-600) 14%, transparent);
  --evcp-radius-hero: 28px;
  --evcp-reveal-distance: 16px;
  --evcp-reveal-duration: 620ms;
}

.evcp-hero-gradient {
  background-image: var(--evcp-gradient-hero);
}

.evcp-glow-card {
  border-radius: var(--evcp-radius-hero);
  box-shadow: var(--evcp-shadow-glow);
}

.evcp-reveal {
  opacity: 0;
  transform: translateY(var(--evcp-reveal-distance));
  transition:
    opacity var(--evcp-reveal-duration) cubic-bezier(0.22, 1, 0.36, 1),
    transform var(--evcp-reveal-duration) cubic-bezier(0.22, 1, 0.36, 1);
}

.evcp-reveal-visible {
  opacity: 1;
  transform: none;
}

/* No JavaScript, or motion turned down: content must be visible and still. */
@media (prefers-reduced-motion: reduce) {
  .evcp-reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 4: Export the stylesheet from `packages/ui/package.json`**

Add to the `exports` map, next to the existing `"./styles.css"` entry:

```json
"./marketing.css": "./marketing.css"
```

- [ ] **Step 5: Extend `scripts/quality/check-design-system.mjs`**

Three edits. First, cover the app:

```js
const APP_SRC_DIRS = [
  "apps/admin-web/src",
  "apps/creator-web/src",
  "apps/app-store-pwa/src",
  "apps/landing-web/src"
];
```

Second, replace the single approved import constant with a list, and update its use:

```js
const APPROVED_UI_CSS_IMPORTS = ['import "@evcp/ui/styles.css"', 'import "@evcp/ui/marketing.css"'];
```

```js
if (
  LOCAL_CSS_IMPORT_PATTERN.test(line) &&
  !APPROVED_UI_CSS_IMPORTS.some((approved) => line.includes(approved))
) {
```

Third, add the conditional `globals.css` exemption. Insert this constant near the other patterns:

```js
// Next.js requires a CSS entry point, so landing-web gets exactly one stylesheet.
// It is allowed to exist only while it does nothing but pull in @evcp/ui and tell
// Tailwind where to look — no declarations, no selectors, no other imports.
const LANDING_CSS_ENTRY = "apps/landing-web/src/app/globals.css";
const ALLOWED_ENTRY_LINE =
  /^\s*(?:$|\/\*|\*|\*\/|@import\s+["']@evcp\/ui\/[a-z-]+\.css["']\s*;|@source\s+["'][^"']+["']\s*;)/;
```

and replace the unconditional stylesheet rejection with:

```js
if (STYLE_EXTENSIONS.has(extension)) {
  if (file === LANDING_CSS_ENTRY) {
    lines.forEach((line, index) => {
      if (!ALLOWED_ENTRY_LINE.test(line)) {
        reportViolation(
          violations,
          file,
          index + 1,
          "landing-web globals.css may only import @evcp/ui stylesheets and declare @source paths"
        );
      }
    });
    continue;
  }
  reportViolation(
    violations,
    file,
    1,
    "app-local stylesheet detected; put shared styling in packages/ui/styles.css"
  );
  continue;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --import tsx --test tests/unit/design-system-governance.test.mjs`
Expected: PASS, including every pre-existing case in the file.

Then confirm the checker still passes across the untouched apps:

Run: `pnpm check:design-system`
Expected: `[design-system] UI governance check passed`

- [ ] **Step 7: Commit**

```bash
git add packages/ui/marketing.css packages/ui/package.json scripts/quality/check-design-system.mjs tests/unit/design-system-governance.test.mjs
git commit -m "feat(ui): add marketing tokens and govern landing-web sources"
```

---

### Task 2: Scaffold the Next.js app

**Files:**

- Create: `apps/landing-web/package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Modify: `package.json`, `tsconfig.test.json`, `.gitignore`, `.prettierignore`, `.oxlintrc.json`
- Test: `tests/unit/landing-web-contract.test.mjs`

**Interfaces:**

- Consumes: `@evcp/ui/marketing.css` from Task 1.
- Produces: a buildable workspace package named `@evcp/landing-web`; the `@/` alias resolving to `apps/landing-web/src` both in `next build` and under the unit-test runner.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/landing-web-contract.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("apps/landing-web/package.json", "utf8"));

test("landing-web satisfies the workspace script contract", () => {
  assert.equal(manifest.name, "@evcp/landing-web");
  for (const script of ["dev", "build", "start", "typecheck"]) {
    assert.ok(manifest.scripts?.[script], `missing script ${script}`);
  }
});

test("landing-web runs on its own dev port", () => {
  assert.match(manifest.scripts.dev, /4103/);
});

test("landing-web depends on the shared design system", () => {
  assert.equal(manifest.dependencies["@evcp/ui"], "workspace:*");
});

test("next is configured for a standalone monorepo build", () => {
  const config = readFileSync("apps/landing-web/next.config.ts", "utf8");
  assert.match(config, /output:\s*"standalone"/);
  assert.match(config, /outputFileTracingRoot/);
});

test("the css entry only pulls in the shared design system", () => {
  const css = readFileSync("apps/landing-web/src/app/globals.css", "utf8");
  assert.match(css, /@import "@evcp\/ui\/styles\.css";/);
  assert.match(css, /@import "@evcp\/ui\/marketing\.css";/);
  assert.doesNotMatch(css, /\{/);
});

test("next build output is ignored by the repo tooling", () => {
  for (const path of [".gitignore", ".prettierignore"]) {
    assert.match(readFileSync(path, "utf8"), /^\.next$/m, `${path} must ignore .next`);
  }
  const oxlint = JSON.parse(readFileSync(".oxlintrc.json", "utf8"));
  assert.ok(oxlint.ignorePatterns.includes(".next/"), "oxlint must ignore .next/");
});

test("unit tests can resolve the landing-web @/ alias", () => {
  const testConfig = JSON.parse(readFileSync("tsconfig.test.json", "utf8"));
  assert.deepEqual(testConfig.compilerOptions.paths["@/*"], [
    "./apps/creator-web/src/*",
    "./apps/landing-web/src/*"
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/landing-web-contract.test.mjs`
Expected: FAIL immediately — `ENOENT: apps/landing-web/package.json`.

- [ ] **Step 3: Create the app manifest**

`apps/landing-web/package.json`:

```json
{
  "name": "@evcp/landing-web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 4103",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@evcp/ui": "workspace:*",
    "lucide-react": "^1.31.0",
    "next": "16.3.4",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "tailwindcss": "^4.3.3",
    "typescript": "^7.0.2"
  }
}
```

- [ ] **Step 4: Create the TypeScript and build configuration**

`apps/landing-web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }],
    "incremental": true
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/landing-web/next.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { NextConfig } from "next";

// The standalone tracer must start at the monorepo root, otherwise it cannot follow the
// pnpm workspace symlink into packages/ui and the server ships without its styles.
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true
};

export default nextConfig;
```

`apps/landing-web/postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {}
  }
};
```

- [ ] **Step 5: Create the CSS entry and a minimal shell**

`apps/landing-web/src/app/globals.css` — every line must satisfy the checker from Task 1:

```css
/* Entry point only. All styling lives in packages/ui. */
@import "@evcp/ui/styles.css";
@import "@evcp/ui/marketing.css";
@source "../";
```

`apps/landing-web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Horizon — enterprise AI application builder",
  description:
    "Turn a requirement into a governed internal application, on infrastructure you control."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page text-body min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

`apps/landing-web/src/app/page.tsx` — a placeholder that later tasks replace:

```tsx
export default function LandingPage() {
  return <main className="mx-auto max-w-5xl px-6 py-24">Horizon</main>;
}
```

- [ ] **Step 6: Wire the app into the repository tooling**

Add to root `package.json` scripts, next to `dev:store`:

```json
"dev:landing": "pnpm --filter @evcp/landing-web dev"
```

Leave the parallel `dev` script alone — the landing page is not part of the platform dev loop.

In `tsconfig.test.json`, replace the `@/*` mapping:

```json
"@/*": ["./apps/creator-web/src/*", "./apps/landing-web/src/*"]
```

Append `.next` to `.gitignore` and `.prettierignore` on its own line, and add `".next/"` to `ignorePatterns` in `.oxlintrc.json`.

- [ ] **Step 7: Install and verify the build**

```bash
pnpm install
pnpm --filter @evcp/landing-web build
pnpm --filter @evcp/landing-web typecheck
```

Expected: the build succeeds and reports a standalone output; typecheck is silent.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --import tsx --test tests/unit/landing-web-contract.test.mjs`
Expected: PASS, all seven cases.

- [ ] **Step 9: Commit**

```bash
git add apps/landing-web package.json pnpm-lock.yaml tsconfig.test.json .gitignore .prettierignore .oxlintrc.json tests/unit/landing-web-contract.test.mjs
git commit -m "feat(landing-web): scaffold the Next.js marketing app"
```

---

### Task 3: Shared primitives

**Files:**

- Create: `apps/landing-web/src/shared/site-config.ts`, `content-types.ts`, `section.tsx`, `section-heading.tsx`, `action-button.tsx`, `reveal.tsx`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`

**Interfaces:**

- Consumes: the `@/` alias and `@evcp/ui/marketing.css` classes from Tasks 1–2.
- Produces, for every later task:
  - `siteConfig: { name: string; repositoryUrl: string; navItems: readonly NavItem[] }`
  - `type NavItem = { label: string; href: string }`
  - `type FeatureItem = { title: string; description: string }`
  - `type LinkAction = { label: string; href: string; external?: boolean }`
  - `Section({ id, tone, children }: { id: string; tone?: "page" | "surface"; children: ReactNode })`
  - `SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string })`
  - `ActionButton({ action, variant }: { action: LinkAction; variant: "primary" | "secondary" })`
  - `Reveal({ children }: { children: ReactNode })`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/landing-web-render-smoke.test.mjs`. Later tasks append to it.

```js
import test from "node:test";
import assert from "node:assert/strict";

// Server components rendered statically; no browser globals, no effects.
globalThis.IntersectionObserver ??= class {
  observe() {}
  disconnect() {}
};

const React = (await import("react")).default;
globalThis.React = React;
const { renderToStaticMarkup } = await import("react-dom/server");

const base = "../../apps/landing-web/src";

const { siteConfig } = await import(`${base}/shared/site-config.ts`);
const { Section } = await import(`${base}/shared/section.tsx`);
const { SectionHeading } = await import(`${base}/shared/section-heading.tsx`);
const { ActionButton } = await import(`${base}/shared/action-button.tsx`);
const { Reveal } = await import(`${base}/shared/reveal.tsx`);

test("site config points at the public repository", () => {
  assert.equal(
    siteConfig.repositoryUrl,
    "https://github.com/0xlabsTeam/EnterpriseVibeCodingPlatform"
  );
  assert.ok(siteConfig.navItems.length > 0);
});

test("Section renders an anchorable band", () => {
  const html = renderToStaticMarkup(
    React.createElement(Section, { id: "demo" }, React.createElement("p", null, "body"))
  );
  assert.match(html, /id="demo"/);
  assert.match(html, /body/);
});

test("SectionHeading renders eyebrow, title and description", () => {
  const html = renderToStaticMarkup(
    React.createElement(SectionHeading, {
      eyebrow: "Eyebrow",
      title: "Title",
      description: "Description"
    })
  );
  for (const text of ["Eyebrow", "Title", "Description"]) {
    assert.match(html, new RegExp(text));
  }
});

test("ActionButton marks external links safe", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActionButton, {
      action: { label: "GitHub", href: "https://example.com", external: true },
      variant: "secondary"
    })
  );
  assert.match(html, /rel="noreferrer"/);
  assert.match(html, /target="_blank"/);
});

test("Reveal renders its children in the server output", () => {
  const html = renderToStaticMarkup(
    React.createElement(Reveal, null, React.createElement("p", null, "visible"))
  );
  assert.match(html, /visible/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — the modules under `src/shared` do not exist.

- [ ] **Step 3: Write the config and types**

`apps/landing-web/src/shared/site-config.ts`:

```ts
export type NavItem = { label: string; href: string };

export const siteConfig = {
  name: "Horizon",
  repositoryUrl: "https://github.com/0xlabsTeam/EnterpriseVibeCodingPlatform",
  navItems: [
    { label: "Platform", href: "#surfaces" },
    { label: "How it works", href: "#lifecycle" },
    { label: "Security", href: "#governance" },
    { label: "Self-host", href: "#self-host" },
    { label: "FAQ", href: "#faq" }
  ] as const satisfies readonly NavItem[]
};
```

`apps/landing-web/src/shared/content-types.ts`:

```ts
export type FeatureItem = { title: string; description: string };
export type LinkAction = { label: string; href: string; external?: boolean };
```

- [ ] **Step 4: Write the layout primitives**

`apps/landing-web/src/shared/section.tsx`:

```tsx
import type { ReactNode } from "react";

const toneClass = {
  page: "bg-page",
  surface: "bg-surface"
} as const;

export function Section({
  id,
  tone = "page",
  children
}: {
  id: string;
  tone?: keyof typeof toneClass;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${toneClass[tone]} scroll-mt-24 px-6 py-24 sm:py-32`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}
```

`apps/landing-web/src/shared/section-heading.tsx`:

```tsx
export function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? (
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted mt-5 text-lg leading-relaxed text-pretty">{description}</p>
      ) : null}
    </div>
  );
}
```

`apps/landing-web/src/shared/action-button.tsx`:

```tsx
import type { LinkAction } from "@/shared/content-types";

const variantClass = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong shadow-card",
  secondary: "bg-surface text-body border-border hover:bg-surface-muted border"
} as const;

export function ActionButton({
  action,
  variant
}: {
  action: LinkAction;
  variant: keyof typeof variantClass;
}) {
  const external = action.external ? { target: "_blank" as const, rel: "noreferrer" as const } : {};
  return (
    <a
      href={action.href}
      {...external}
      className={`rounded-control inline-flex items-center justify-center px-6 py-3 text-base font-medium transition-colors ${variantClass[variant]}`}
    >
      {action.label}
    </a>
  );
}
```

- [ ] **Step 5: Write the reveal client component**

`apps/landing-web/src/shared/reveal.tsx` — the only client component in the app. Its initial server markup already carries the content; the class only animates it in.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? "evcp-reveal evcp-reveal-visible" : "evcp-reveal"}>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS, all five cases. The `ActionButton` case proves the `@/shared/content-types` alias resolves through the ordered `paths` array.

- [ ] **Step 7: Verify governance and commit**

```bash
node scripts/quality/check-design-system.mjs
node scripts/quality/check-frontend-architecture.mjs
git add apps/landing-web/src/shared tests/unit/landing-web-render-smoke.test.mjs
git commit -m "feat(landing-web): add shared section primitives"
```

---

### Task 4: Site chrome — navigation and footer

**Files:**

- Create: `apps/landing-web/src/shared/site-nav.tsx`, `site-footer.tsx`
- Modify: `apps/landing-web/src/app/layout.tsx`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`

**Interfaces:**

- Consumes: `siteConfig`, `ActionButton`, `LinkAction`.
- Produces: `SiteNav()` and `SiteFooter()`, both taking no props.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/landing-web-render-smoke.test.mjs`, after the existing imports:

```js
const { SiteNav } = await import(`${base}/shared/site-nav.tsx`);
const { SiteFooter } = await import(`${base}/shared/site-footer.tsx`);

test("SiteNav lists every configured anchor and the repository link", () => {
  const html = renderToStaticMarkup(React.createElement(SiteNav));
  for (const item of siteConfig.navItems) {
    assert.match(html, new RegExp(`href="${item.href}"`));
    assert.match(html, new RegExp(item.label));
  }
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("SiteFooter states the project name without claiming a licence", () => {
  const html = renderToStaticMarkup(React.createElement(SiteFooter));
  assert.match(html, /Horizon/);
  assert.doesNotMatch(html, /licen[sc]e/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — `site-nav.tsx` cannot be resolved.

- [ ] **Step 3: Write the navigation**

`apps/landing-web/src/shared/site-nav.tsx`:

```tsx
import { ActionButton } from "@/shared/action-button";
import { siteConfig } from "@/shared/site-config";

export function SiteNav() {
  return (
    <header className="bg-surface/80 border-border-soft sticky top-0 z-50 border-b backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {siteConfig.navItems.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="text-muted hover:text-body text-sm transition-colors">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <ActionButton
          action={{ label: "GitHub", href: siteConfig.repositoryUrl, external: true }}
          variant="secondary"
        />
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Write the footer**

`apps/landing-web/src/shared/site-footer.tsx`:

```tsx
import { siteConfig } from "@/shared/site-config";

export function SiteFooter() {
  return (
    <footer className="bg-surface border-border-soft border-t px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">
          {siteConfig.name} — enterprise AI application builder, developed in the open.
        </p>
        <a
          href={siteConfig.repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-sm font-medium"
        >
          View the source
        </a>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: Mount the chrome in the layout**

Replace the `<body>` contents in `apps/landing-web/src/app/layout.tsx`:

```tsx
<body className="bg-page text-body min-h-screen antialiased">
  <SiteNav />
  {children}
  <SiteFooter />
</body>
```

and add the imports:

```tsx
import { SiteFooter } from "@/shared/site-footer";
import { SiteNav } from "@/shared/site-nav";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS, seven cases.

- [ ] **Step 7: Commit**

```bash
git add apps/landing-web/src tests/unit/landing-web-render-smoke.test.mjs
git commit -m "feat(landing-web): add site navigation and footer"
```

---

### Task 5: Hero section

**Files:**

- Create: `apps/landing-web/src/features/hero/index.ts`, `hero-content.ts`, `hero-section.tsx`, `hero-product-visual.tsx`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`, `tests/unit/landing-web-content.test.mjs`

**Interfaces:**

- Consumes: `Section`, `ActionButton`, `LinkAction`, `siteConfig`.
- Produces: `HeroSection()` exported from `@/features/hero`, and `heroContent: { eyebrow: string; headline: string; subhead: string; actions: readonly LinkAction[] }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/landing-web-content.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

const base = "../../apps/landing-web/src";
const { heroContent } = await import(`${base}/features/hero/hero-content.ts`);

test("hero copy is present and in English", () => {
  assert.ok(heroContent.headline.length > 0);
  assert.ok(heroContent.subhead.length > 0);
  assert.doesNotMatch(
    `${heroContent.headline} ${heroContent.subhead}`,
    /[฀-๿]/,
    "landing copy must be English only"
  );
});

test("hero offers a primary anchor and an external repository action", () => {
  assert.equal(heroContent.actions.length, 2);
  assert.ok(heroContent.actions[0].href.startsWith("#"));
  assert.equal(heroContent.actions[1].external, true);
  assert.ok(heroContent.actions[1].href.startsWith("https://"));
});
```

Append to `tests/unit/landing-web-render-smoke.test.mjs`:

```js
const { HeroSection } = await import(`${base}/features/hero`);

test("HeroSection renders the headline and both actions", () => {
  const html = renderToStaticMarkup(React.createElement(HeroSection));
  assert.match(html, /Ship internal software/);
  assert.match(html, /href="#self-host"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — the hero feature does not exist.

- [ ] **Step 3: Write the hero content**

`apps/landing-web/src/features/hero/hero-content.ts`:

```ts
import type { LinkAction } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

export const heroContent = {
  eyebrow: "Open source · self-hosted",
  headline: "Ship internal software at AI speed — under enterprise control.",
  subhead:
    "Horizon turns a requirement into a product requirements document, an AI-built workspace, and a governed deployment, all inside infrastructure you own.",
  actions: [
    { label: "Get started", href: "#self-host" },
    { label: "View on GitHub", href: siteConfig.repositoryUrl, external: true }
  ] as const satisfies readonly LinkAction[]
};
```

- [ ] **Step 4: Write the product visual**

`apps/landing-web/src/features/hero/hero-product-visual.tsx` — a stylised Creator workspace built from tokens, so it never goes stale like a screenshot:

```tsx
const workspaceRows = [
  { label: "PRD baseline", value: "v4 · approved" },
  { label: "Workspace", value: "container running" },
  { label: "Preview", value: "checkpoint 12" },
  { label: "Publish policy", value: "2 of 3 approvals" }
];

export function HeroProductVisual() {
  return (
    <div className="evcp-glow-card bg-surface border-border-soft overflow-hidden border">
      <div className="border-border-soft flex items-center gap-2 border-b px-5 py-4">
        <span className="bg-primary-soft rounded-pill h-3 w-3" />
        <span className="bg-primary-soft rounded-pill h-3 w-3" />
        <span className="bg-primary-soft rounded-pill h-3 w-3" />
        <span className="text-muted ml-3 text-sm">Horizon Creator</span>
      </div>
      <dl className="divide-border-soft divide-y">
        {workspaceRows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-5 py-4">
            <dt className="text-muted text-sm">{row.label}</dt>
            <dd className="text-body text-sm font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 5: Write the hero section and its public API**

`apps/landing-web/src/features/hero/hero-section.tsx`:

```tsx
import { ActionButton } from "@/shared/action-button";
import { heroContent } from "./hero-content";
import { HeroProductVisual } from "./hero-product-visual";

export function HeroSection() {
  return (
    <section id="top" className="evcp-hero-gradient px-6 pt-24 pb-28 sm:pt-32 sm:pb-36">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-2">
        <div>
          <p className="text-primary text-sm font-semibold tracking-widest uppercase">
            {heroContent.eyebrow}
          </p>
          <h1 className="mt-5 text-5xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            {heroContent.headline}
          </h1>
          <p className="text-muted mt-7 max-w-xl text-lg leading-relaxed text-pretty">
            {heroContent.subhead}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            {heroContent.actions.map((action, index) => (
              <ActionButton
                key={action.href}
                action={action}
                variant={index === 0 ? "primary" : "secondary"}
              />
            ))}
          </div>
        </div>
        <HeroProductVisual />
      </div>
    </section>
  );
}
```

`apps/landing-web/src/features/hero/index.ts`:

```ts
export { HeroSection } from "./hero-section";
export { heroContent } from "./hero-content";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS.

A caution for the rest of this task and every later one: tightening type with an arbitrary value such as `leading-[1.05]` or `text-[64px]` is the easiest way to fail `check-design-system.mjs`. Stay on the named scale — `leading-tight`, `text-5xl`, `sm:text-6xl`.

- [ ] **Step 7: Commit**

```bash
node scripts/quality/check-design-system.mjs
git add apps/landing-web/src/features/hero tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs
git commit -m "feat(landing-web): add hero section"
```

---

### Task 6: Surfaces and lifecycle sections

**Files:**

- Create: `apps/landing-web/src/features/surfaces/{index.ts,surfaces-content.ts,surfaces-section.tsx}`
- Create: `apps/landing-web/src/features/lifecycle/{index.ts,lifecycle-content.ts,lifecycle-section.tsx}`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`, `tests/unit/landing-web-content.test.mjs`

**Interfaces:**

- Consumes: `Section`, `SectionHeading`, `Reveal`, `FeatureItem`.
- Produces: `SurfacesSection()` from `@/features/surfaces`, `LifecycleSection()` from `@/features/lifecycle`, plus `surfacesContent` and `lifecycleContent`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/landing-web-content.test.mjs`:

```js
const { surfacesContent } = await import(`${base}/features/surfaces/surfaces-content.ts`);
const { lifecycleContent } = await import(`${base}/features/lifecycle/lifecycle-content.ts`);

test("the three product surfaces match the repository README", () => {
  assert.deepEqual(
    surfacesContent.items.map((item) => item.title),
    ["Admin Console", "Creator App", "App Store PWA"]
  );
  for (const item of surfacesContent.items) {
    assert.ok(item.audience.length > 0);
    assert.ok(item.description.length > 0);
  }
});

test("the lifecycle runs from idea to publish in five steps", () => {
  assert.equal(lifecycleContent.steps.length, 5);
  assert.equal(lifecycleContent.steps.at(-1).title, "Publish");
});
```

Append to `tests/unit/landing-web-render-smoke.test.mjs`:

```js
const { SurfacesSection } = await import(`${base}/features/surfaces`);
const { LifecycleSection } = await import(`${base}/features/lifecycle`);

test("SurfacesSection renders each surface", () => {
  const html = renderToStaticMarkup(React.createElement(SurfacesSection));
  assert.match(html, /id="surfaces"/);
  for (const item of surfacesContent.items) assert.ok(html.includes(item.title));
});

test("LifecycleSection renders every numbered step", () => {
  const html = renderToStaticMarkup(React.createElement(LifecycleSection));
  assert.match(html, /id="lifecycle"/);
  for (const step of lifecycleContent.steps) assert.ok(html.includes(step.title));
});
```

Add the content imports to the render-smoke file as well:

```js
const { surfacesContent } = await import(`${base}/features/surfaces`);
const { lifecycleContent } = await import(`${base}/features/lifecycle`);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — neither feature exists.

- [ ] **Step 3: Write the surfaces feature**

`apps/landing-web/src/features/surfaces/surfaces-content.ts`:

```ts
export type SurfaceItem = { title: string; audience: string; description: string };

export const surfacesContent = {
  eyebrow: "The platform",
  title: "Three surfaces, one governed platform.",
  description:
    "Administrators, builders, and employees each get a purpose-built application over the same Platform API.",
  items: [
    {
      title: "Admin Console",
      audience: "IT, security, and platform administrators",
      description:
        "Govern providers, access, policies, operations, licenses, and release readiness."
    },
    {
      title: "Creator App",
      audience: "Business builders and development teams",
      description:
        "Turn a requirement into a PRD, an AI workspace, a preview, and a published application."
    },
    {
      title: "App Store PWA",
      audience: "Employees and approved end users",
      description: "Discover internal apps, request access, and submit support or product feedback."
    }
  ] as const satisfies readonly SurfaceItem[]
};
```

`apps/landing-web/src/features/surfaces/surfaces-section.tsx`:

```tsx
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { surfacesContent } from "./surfaces-content";

export function SurfacesSection() {
  return (
    <Section id="surfaces" tone="surface">
      <SectionHeading
        eyebrow={surfacesContent.eyebrow}
        title={surfacesContent.title}
        description={surfacesContent.description}
      />
      <Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {surfacesContent.items.map((item) => (
            <article
              key={item.title}
              className="bg-page border-border-soft rounded-card shadow-card border p-7"
            >
              <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
              <p className="text-primary mt-2 text-sm font-medium">{item.audience}</p>
              <p className="text-muted mt-4 leading-relaxed">{item.description}</p>
            </article>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
```

`apps/landing-web/src/features/surfaces/index.ts`:

```ts
export { SurfacesSection } from "./surfaces-section";
export { surfacesContent } from "./surfaces-content";
```

- [ ] **Step 4: Write the lifecycle feature**

`apps/landing-web/src/features/lifecycle/lifecycle-content.ts`:

```ts
import type { FeatureItem } from "@/shared/content-types";

export const lifecycleContent = {
  eyebrow: "How it works",
  title: "From a sentence to a deployed application.",
  description:
    "Every step leaves a record, so a delivered application can be traced back to the requirement that asked for it.",
  steps: [
    { title: "Describe", description: "State the requirement in plain language." },
    {
      title: "Draft the PRD",
      description: "Horizon writes a product requirements document and baselines every version."
    },
    {
      title: "Build",
      description:
        "The AI generation loop works inside a per-project container against a real workspace."
    },
    {
      title: "Preview",
      description: "Check the running application at a preview URL before anyone else sees it."
    },
    {
      title: "Publish",
      description:
        "An approval policy gates the release, then the app appears in the internal App Store."
    }
  ] as const satisfies readonly FeatureItem[]
};
```

`apps/landing-web/src/features/lifecycle/lifecycle-section.tsx`:

```tsx
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { lifecycleContent } from "./lifecycle-content";

export function LifecycleSection() {
  return (
    <Section id="lifecycle">
      <SectionHeading
        eyebrow={lifecycleContent.eyebrow}
        title={lifecycleContent.title}
        description={lifecycleContent.description}
      />
      <Reveal>
        <ol className="mt-14 grid gap-6 md:grid-cols-5">
          {lifecycleContent.steps.map((step, index) => (
            <li key={step.title} className="bg-surface border-border-soft rounded-card border p-6">
              <span className="bg-primary-soft text-primary rounded-pill inline-flex h-8 w-8 items-center justify-center text-sm font-semibold">
                {index + 1}
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
              <p className="text-muted mt-2 text-sm leading-relaxed">{step.description}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  );
}
```

`apps/landing-web/src/features/lifecycle/index.ts`:

```ts
export { LifecycleSection } from "./lifecycle-section";
export { lifecycleContent } from "./lifecycle-content";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
node scripts/quality/check-design-system.mjs && node scripts/quality/check-frontend-architecture.mjs
git add apps/landing-web/src/features tests/unit
git commit -m "feat(landing-web): add surfaces and lifecycle sections"
```

---

### Task 7: Governance and self-host sections

**Files:**

- Create: `apps/landing-web/src/features/governance/{index.ts,governance-content.ts,governance-section.tsx}`
- Create: `apps/landing-web/src/features/self-host/{index.ts,self-host-content.ts,self-host-section.tsx}`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`, `tests/unit/landing-web-content.test.mjs`

**Interfaces:**

- Consumes: `Section`, `SectionHeading`, `Reveal`, `FeatureItem`.
- Produces: `GovernanceSection()` from `@/features/governance`, `SelfHostSection()` from `@/features/self-host`, plus `governanceContent` and `selfHostContent`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/landing-web-content.test.mjs`:

```js
const { governanceContent } = await import(`${base}/features/governance/governance-content.ts`);
const { selfHostContent } = await import(`${base}/features/self-host/self-host-content.ts`);

test("governance covers the controls the platform actually implements", () => {
  assert.equal(governanceContent.items.length, 6);
  const titles = governanceContent.items.map((item) => item.title).join(" ");
  for (const expected of ["Provider key protection", "Isolation by default", "Single sign-on"]) {
    assert.ok(titles.includes(expected), `missing ${expected}`);
  }
});

test("self-host quotes the real quick start command", () => {
  assert.equal(selfHostContent.command, "pnpm dev:setup");
  assert.ok(selfHostContent.services.includes("Postgres"));
});
```

Append to `tests/unit/landing-web-render-smoke.test.mjs`:

```js
const { GovernanceSection, governanceContent } = await import(`${base}/features/governance`);
const { SelfHostSection, selfHostContent } = await import(`${base}/features/self-host`);

test("GovernanceSection renders every control", () => {
  const html = renderToStaticMarkup(React.createElement(GovernanceSection));
  assert.match(html, /id="governance"/);
  for (const item of governanceContent.items) assert.ok(html.includes(item.title));
});

test("SelfHostSection renders the quick start command", () => {
  const html = renderToStaticMarkup(React.createElement(SelfHostSection));
  assert.match(html, /id="self-host"/);
  assert.ok(html.includes(selfHostContent.command));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — neither feature exists.

- [ ] **Step 3: Write the governance feature**

`apps/landing-web/src/features/governance/governance-content.ts`:

```ts
import type { FeatureItem } from "@/shared/content-types";

export const governanceContent = {
  eyebrow: "Security and governance",
  title: "The controls are the product.",
  description:
    "AI-assisted delivery is only useful inside an enterprise if every generation, every release, and every access grant leaves evidence behind.",
  items: [
    {
      title: "Provider key protection",
      description:
        "API keys stay in the secret store and are injected at request time, never written into project code."
    },
    {
      title: "Quotas and guardrails",
      description:
        "Per-project spend limits, prompt controls, and a usage record for every generation."
    },
    {
      title: "Isolation by default",
      description: "Each project gets its own runtime container and its own database schema."
    },
    {
      title: "Single sign-on",
      description: "Native accounts, or your existing identity provider over OIDC and SAML."
    },
    {
      title: "Policy-based publish",
      description: "A release passes an approval policy before it reaches a single employee."
    },
    {
      title: "Audit evidence",
      description: "Tasks, previews, deployments, and usage are recorded for later review."
    }
  ] as const satisfies readonly FeatureItem[]
};
```

`apps/landing-web/src/features/governance/governance-section.tsx`:

```tsx
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { governanceContent } from "./governance-content";

export function GovernanceSection() {
  return (
    <Section id="governance" tone="surface">
      <SectionHeading
        eyebrow={governanceContent.eyebrow}
        title={governanceContent.title}
        description={governanceContent.description}
      />
      <Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {governanceContent.items.map((item) => (
            <div key={item.title} className="border-border-soft border-t pt-6">
              <h3 className="font-semibold tracking-tight">{item.title}</h3>
              <p className="text-muted mt-3 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
```

`apps/landing-web/src/features/governance/index.ts`:

```ts
export { GovernanceSection } from "./governance-section";
export { governanceContent } from "./governance-content";
```

- [ ] **Step 4: Write the self-host feature**

`apps/landing-web/src/features/self-host/self-host-content.ts`:

```ts
export const selfHostContent = {
  eyebrow: "Self-host",
  title: "It runs on your server, not ours.",
  description:
    "One Compose file brings up the whole platform. There is no hosted tier to sign up for and no data leaving your network.",
  command: "pnpm dev:setup",
  commandCaption: "Brings up the full stack, applies migrations, seeds the database.",
  services: [
    "Postgres",
    "Redis",
    "MinIO",
    "Keycloak",
    "LiteLLM",
    "OpenBao",
    "Platform API",
    "Caddy"
  ] as const
};
```

`apps/landing-web/src/features/self-host/self-host-section.tsx`:

```tsx
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { selfHostContent } from "./self-host-content";

export function SelfHostSection() {
  return (
    <Section id="self-host">
      <SectionHeading
        eyebrow={selfHostContent.eyebrow}
        title={selfHostContent.title}
        description={selfHostContent.description}
      />
      <Reveal>
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
          <div>
            <pre className="bg-code-bg text-code-text rounded-card overflow-x-auto px-6 py-5 text-sm">
              <code>$ {selfHostContent.command}</code>
            </pre>
            <p className="text-muted mt-4 text-sm">{selfHostContent.commandCaption}</p>
          </div>
          <ul className="flex flex-wrap gap-3">
            {selfHostContent.services.map((service) => (
              <li
                key={service}
                className="bg-surface border-border rounded-pill text-muted border px-4 py-2 text-sm"
              >
                {service}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </Section>
  );
}
```

`apps/landing-web/src/features/self-host/index.ts`:

```ts
export { SelfHostSection } from "./self-host-section";
export { selfHostContent } from "./self-host-content";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS.

If `bg-code-bg` or `text-code-text` do not produce styles, check the `@theme inline` block in `packages/ui/styles.css` for the exact generated utility names and use those; do not substitute a palette utility.

- [ ] **Step 6: Commit**

```bash
node scripts/quality/check-design-system.mjs && node scripts/quality/check-frontend-architecture.mjs
git add apps/landing-web/src/features tests/unit
git commit -m "feat(landing-web): add governance and self-host sections"
```

---

### Task 8: Open source, FAQ, and final call to action

**Files:**

- Create: `apps/landing-web/src/features/open-source/{index.ts,open-source-content.ts,open-source-section.tsx}`
- Create: `apps/landing-web/src/features/faq/{index.ts,faq-content.ts,faq-section.tsx}`
- Create: `apps/landing-web/src/features/final-cta/{index.ts,final-cta-section.tsx}`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`, `tests/unit/landing-web-content.test.mjs`

**Interfaces:**

- Consumes: `Section`, `SectionHeading`, `Reveal`, `ActionButton`, `siteConfig`, `heroContent`.
- Produces: `OpenSourceSection()`, `FaqSection()`, `FinalCtaSection()` from their respective feature indexes, plus `openSourceContent` and `faqContent`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/landing-web-content.test.mjs`:

```js
const { faqContent } = await import(`${base}/features/faq/faq-content.ts`);
const { openSourceContent } = await import(`${base}/features/open-source/open-source-content.ts`);

test("the FAQ answers four questions and claims no licence", () => {
  assert.equal(faqContent.entries.length, 4);
  const all = faqContent.entries.map((e) => `${e.question} ${e.answer}`).join(" ");
  assert.doesNotMatch(all, /licen[sc]e/i, "the repository has no LICENSE file yet");
});

test("the open source section links to the repository", () => {
  assert.ok(openSourceContent.action.href.startsWith("https://github.com/"));
  assert.equal(openSourceContent.action.external, true);
});
```

Append to `tests/unit/landing-web-render-smoke.test.mjs`:

```js
const { OpenSourceSection } = await import(`${base}/features/open-source`);
const { FaqSection, faqContent } = await import(`${base}/features/faq`);
const { FinalCtaSection } = await import(`${base}/features/final-cta`);

test("OpenSourceSection renders the repository link", () => {
  const html = renderToStaticMarkup(React.createElement(OpenSourceSection));
  assert.match(html, /id="open-source"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});

test("FaqSection renders every question", () => {
  const html = renderToStaticMarkup(React.createElement(FaqSection));
  assert.match(html, /id="faq"/);
  for (const entry of faqContent.entries) assert.ok(html.includes(entry.question));
});

test("FinalCtaSection repeats both hero actions", () => {
  const html = renderToStaticMarkup(React.createElement(FinalCtaSection));
  assert.match(html, /href="#self-host"/);
  assert.ok(html.includes(siteConfig.repositoryUrl));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — none of the three features exist.

- [ ] **Step 3: Write the open source feature**

`apps/landing-web/src/features/open-source/open-source-content.ts`:

```ts
import type { LinkAction } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

export const openSourceContent = {
  eyebrow: "Open source",
  title: "Developed in the open.",
  description:
    "The architecture decision records explain why the platform is shaped the way it is — read them before you commit to it, then run it yourself and open an issue.",
  action: {
    label: "Read the source",
    href: siteConfig.repositoryUrl,
    external: true
  } satisfies LinkAction
};
```

`apps/landing-web/src/features/open-source/open-source-section.tsx`:

```tsx
import { ActionButton } from "@/shared/action-button";
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { openSourceContent } from "./open-source-content";

export function OpenSourceSection() {
  return (
    <Section id="open-source" tone="surface">
      <Reveal>
        <SectionHeading
          eyebrow={openSourceContent.eyebrow}
          title={openSourceContent.title}
          description={openSourceContent.description}
        />
        <div className="mt-10">
          <ActionButton action={openSourceContent.action} variant="secondary" />
        </div>
      </Reveal>
    </Section>
  );
}
```

`apps/landing-web/src/features/open-source/index.ts`:

```ts
export { OpenSourceSection } from "./open-source-section";
export { openSourceContent } from "./open-source-content";
```

- [ ] **Step 4: Write the FAQ feature**

`apps/landing-web/src/features/faq/faq-content.ts`:

```ts
export type FaqEntry = { question: string; answer: string };

export const faqContent = {
  eyebrow: "FAQ",
  title: "Questions worth asking first.",
  entries: [
    {
      question: "Which AI models can it use?",
      answer:
        "Providers are configured through a gateway, so Horizon points at the models your organisation already approves rather than at a fixed vendor."
    },
    {
      question: "Where does my data live?",
      answer:
        "On your own server. The platform is designed to run entirely inside your network, including the database, object storage, and identity provider."
    },
    {
      question: "Can it run on Kubernetes?",
      answer:
        "The reference deployment is Docker Compose. Nothing in the platform hardcodes Compose service names or local filesystem assumptions, so a Kubernetes migration stays open."
    },
    {
      question: "Is it production ready?",
      answer:
        "It is under active development and ships in numbered sprints. Read the architecture decision records to judge fit before you depend on it."
    }
  ] as const satisfies readonly FaqEntry[]
};
```

`apps/landing-web/src/features/faq/faq-section.tsx`:

```tsx
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { faqContent } from "./faq-content";

export function FaqSection() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow={faqContent.eyebrow} title={faqContent.title} />
      <Reveal>
        <dl className="mt-12 grid gap-10 md:grid-cols-2">
          {faqContent.entries.map((entry) => (
            <div key={entry.question}>
              <dt className="font-semibold tracking-tight">{entry.question}</dt>
              <dd className="text-muted mt-3 leading-relaxed">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}
```

`apps/landing-web/src/features/faq/index.ts`:

```ts
export { FaqSection } from "./faq-section";
export { faqContent } from "./faq-content";
```

- [ ] **Step 5: Write the final call to action**

It reuses the hero's two actions rather than restating them, so the two never drift. Cross-feature import goes through the public index, as the architecture check requires.

`apps/landing-web/src/features/final-cta/final-cta-section.tsx`:

```tsx
import { heroContent } from "@/features/hero";
import { ActionButton } from "@/shared/action-button";

export function FinalCtaSection() {
  return (
    <section id="start" className="evcp-hero-gradient px-6 py-28">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Run it yourself this afternoon.
        </h2>
        <p className="text-muted mt-6 text-lg leading-relaxed text-pretty">
          Clone the repository, bring up the stack with one command, and build your first internal
          application end to end.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {heroContent.actions.map((action, index) => (
            <ActionButton
              key={action.href}
              action={action}
              variant={index === 0 ? "primary" : "secondary"}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

`apps/landing-web/src/features/final-cta/index.ts`:

```ts
export { FinalCtaSection } from "./final-cta-section";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
node scripts/quality/check-design-system.mjs && node scripts/quality/check-frontend-architecture.mjs
git add apps/landing-web/src/features tests/unit
git commit -m "feat(landing-web): add open source, FAQ, and final CTA sections"
```

---

### Task 9: Compose the page and finish the metadata

**Files:**

- Modify: `apps/landing-web/src/app/page.tsx`, `apps/landing-web/src/app/layout.tsx`
- Create: `apps/landing-web/src/app/sitemap.ts`, `apps/landing-web/src/app/robots.ts`
- Test: `tests/unit/landing-web-render-smoke.test.mjs`, `tests/unit/landing-web-content.test.mjs`

**Interfaces:**

- Consumes: every feature's `index.ts` from Tasks 5–8, and `siteConfig`.
- Produces: the rendered page; `NEXT_PUBLIC_SITE_URL` read with a localhost fallback.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/landing-web-render-smoke.test.mjs`:

```js
const LandingPage = (await import(`${base}/app/page.tsx`)).default;

test("the page renders every section in order", () => {
  const html = renderToStaticMarkup(React.createElement(LandingPage));
  const order = [
    'id="top"',
    'id="surfaces"',
    'id="lifecycle"',
    'id="governance"',
    'id="self-host"',
    'id="open-source"',
    'id="faq"',
    'id="start"'
  ];
  let cursor = -1;
  for (const anchor of order) {
    const next = html.indexOf(anchor);
    assert.ok(next > cursor, `${anchor} is missing or out of order`);
    cursor = next;
  }
});
```

Append to `tests/unit/landing-web-content.test.mjs`:

```js
test("every navigation anchor resolves to a section the page renders", async () => {
  const { siteConfig } = await import(`${base}/shared/site-config.ts`);
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("apps/landing-web/src/app/page.tsx", "utf8");
  const sections = readFileSync("apps/landing-web/src/shared/section.tsx", "utf8");
  assert.ok(sections.includes("id={id}"));
  for (const item of siteConfig.navItems) {
    const anchor = item.href.slice(1);
    const feature = page.toLowerCase();
    assert.ok(
      feature.includes(anchor.replace("-", "")) || feature.includes(anchor),
      `no section for ${item.href}`
    );
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: FAIL — the page still renders the Task 2 placeholder.

- [ ] **Step 3: Compose the page**

Replace `apps/landing-web/src/app/page.tsx` entirely. Composition only — no logic, no markup beyond the wrapper.

```tsx
import { FaqSection } from "@/features/faq";
import { FinalCtaSection } from "@/features/final-cta";
import { GovernanceSection } from "@/features/governance";
import { HeroSection } from "@/features/hero";
import { LifecycleSection } from "@/features/lifecycle";
import { OpenSourceSection } from "@/features/open-source";
import { SelfHostSection } from "@/features/self-host";
import { SurfacesSection } from "@/features/surfaces";

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <SurfacesSection />
      <LifecycleSection />
      <GovernanceSection />
      <SelfHostSection />
      <OpenSourceSection />
      <FaqSection />
      <FinalCtaSection />
    </main>
  );
}
```

- [ ] **Step 4: Finish the metadata**

In `apps/landing-web/src/app/layout.tsx`, expand the metadata export:

```tsx
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4103";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Horizon — enterprise AI application builder",
  description:
    "Turn a requirement into a governed internal application, on infrastructure you control.",
  openGraph: {
    title: "Horizon — enterprise AI application builder",
    description:
      "Turn a requirement into a governed internal application, on infrastructure you control.",
    url: siteUrl,
    siteName: "Horizon",
    type: "website"
  }
};
```

`apps/landing-web/src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4103";
  return [{ url: siteUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
```

`apps/landing-web/src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4103";
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/landing-web-content.test.mjs tests/unit/landing-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 6: Look at the actual page**

```bash
pnpm dev:landing
```

Open `http://127.0.0.1:4103` and check three things by eye: the hero gradient is visible and soft rather than banded, sections alternate between the page and surface tones, and scrolling fades each band in once. Then stop the dev server.

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm check
git add apps/landing-web/src tests/unit
git commit -m "feat(landing-web): compose the landing page and site metadata"
```

`pnpm check` must pass in full here — this is the first point where the whole app exists, so lint, typecheck, design-system, frontend-architecture, and the unit suite all have something real to judge.

---

### Task 10: Railway deployment

**Files:**

- Create: `docker/landing-web.Dockerfile`
- Modify: `README.md`
- Test: `tests/unit/landing-web-contract.test.mjs`

**Interfaces:**

- Consumes: the standalone build configured in Task 2.
- Produces: an image whose entrypoint is `node apps/landing-web/server.js`, listening on `$PORT`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/landing-web-contract.test.mjs`:

```js
test("the landing image runs the standalone server", () => {
  const dockerfile = readFileSync("docker/landing-web.Dockerfile", "utf8");
  assert.match(dockerfile, /node:22/);
  assert.match(dockerfile, /pnpm --filter @evcp\/landing-web build/);
  assert.match(dockerfile, /apps\/landing-web\/server\.js/);
  assert.doesNotMatch(dockerfile, /USER root\s*$/m);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/landing-web-contract.test.mjs`
Expected: FAIL — `ENOENT: docker/landing-web.Dockerfile`.

- [ ] **Step 3: Write the Dockerfile**

`docker/landing-web.Dockerfile`. Manifests are copied before sources so a dependency install is cached across content-only changes.

```dockerfile
FROM node:22.22.0-alpine AS builder

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth-sdk/package.json packages/auth-sdk/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/mock-data/package.json packages/mock-data/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/creator-web/package.json apps/creator-web/package.json
COPY apps/app-store-pwa/package.json apps/app-store-pwa/package.json
COPY apps/landing-web/package.json apps/landing-web/package.json
COPY scripts/quality/prepare-git-hooks.mjs scripts/quality/prepare-git-hooks.mjs

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages packages
COPY apps/landing-web apps/landing-web

RUN pnpm --filter @evcp/landing-web build

FROM node:22.22.0-alpine AS runtime

WORKDIR /workspace
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# The standalone bundle already contains the traced node_modules, so no install here.
COPY --from=builder /workspace/apps/landing-web/.next/standalone ./
COPY --from=builder /workspace/apps/landing-web/.next/static ./apps/landing-web/.next/static
COPY --from=builder /workspace/apps/landing-web/public ./apps/landing-web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/" >/dev/null || exit 1

CMD ["node", "apps/landing-web/server.js"]
```

Note that `apps/landing-web/public` must exist for the copy to succeed. If Task 2 left it empty, add a `.gitkeep` so the directory is tracked.

- [ ] **Step 4: Build and run the image locally**

```bash
docker build -f docker/landing-web.Dockerfile -t horizon-landing:local .
docker run --rm -p 4103:3000 horizon-landing:local
```

Expected: the container logs `Ready`, and `curl -sS http://127.0.0.1:4103 | head -c 400` returns HTML containing `Horizon`. Confirm the CSS loaded by checking the response references a `/_next/static/` stylesheet — an empty-styles response means `outputFileTracingRoot` did not pick up `packages/ui`. Stop the container.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --import tsx --test tests/unit/landing-web-contract.test.mjs`
Expected: PASS.

- [ ] **Step 6: Document the deployment**

Add a short subsection to `README.md` under the existing local-development material:

````markdown
### Landing site

The public marketing site lives in `apps/landing-web` and deploys independently of the
private-server stack.

```bash
pnpm dev:landing   # http://127.0.0.1:4103
```
````

It is deployed from `docker/landing-web.Dockerfile`. The only optional environment
variable is `NEXT_PUBLIC_SITE_URL`, used for canonical URLs and the sitemap; the platform
Compose stack does not include it.

````

- [ ] **Step 7: Run the full gate and commit**

```bash
pnpm check
git add docker/landing-web.Dockerfile README.md tests/unit/landing-web-contract.test.mjs apps/landing-web/public
git commit -m "feat(landing-web): add the Railway deployment image"
````

- [ ] **Step 8: Configure the Railway service**

This step is done in the Railway dashboard by a human with access to the account, not by an agent. Record the settings used:

- Source: this repository, branch `feat/landing-web` until it merges, then the default branch.
- Builder: Dockerfile, path `docker/landing-web.Dockerfile`, build context the repository root.
- Variables: none required. Set `NEXT_PUBLIC_SITE_URL` to the public domain once assigned.
- Health check path: `/`.

Do not add the service, connect a domain, or trigger a deploy without explicit confirmation from the repository owner — it publishes public content.

---

## Self-Review

**Spec coverage.** Workspace placement → Task 2. Visual language → Tasks 1, 3, 5. Marketing tokens → Task 1. Design-system governance and the `globals.css` exemption → Task 1. Frontend architecture → enforced in Tasks 3–9 and verified by the `check-frontend-architecture` runs. File-size cap → every created file is well under 400 lines. File layout → Tasks 2–9. Page structure, all nine bands → Tasks 4–9. Calls to action → Tasks 5 and 8. Build-output hygiene → Task 2. Unit-test alias resolution → Task 2 (config) and Task 3 (proof). Deployment → Task 10. Testing, all three files → Tasks 1, 2, 3, 5. No LICENSE claim → enforced by assertions in Tasks 4 and 8.

**Type consistency.** `LinkAction` is defined once in Task 3 and consumed unchanged in Tasks 3, 5, and 8. `FeatureItem` is defined in Task 3 and used in Tasks 6 and 7. `surfacesContent.items` carries `SurfaceItem`, a wider shape than `FeatureItem`, declared locally in Task 6 rather than forced into the shared type. `Section` takes `{ id, tone, children }` in Task 3 and is called with exactly those props thereafter. Feature indexes export both the component and the content object, which the render-smoke tests rely on from Task 6 onward.

**Riskiest step.** Task 10 Step 4 is the one most likely to fail in an unfamiliar way: if `outputFileTracingRoot` does not follow the pnpm symlink into `packages/ui`, the container serves correct HTML with no styling, and the unit tests will not catch it because they never touch the build output. That is why the step checks for a `/_next/static/` stylesheet reference rather than just a 200 response.
