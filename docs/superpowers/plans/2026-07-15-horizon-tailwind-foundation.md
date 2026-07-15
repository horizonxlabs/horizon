# Horizon Tailwind Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Tailwind v4 + a two-layer token system + core cva primitives inside `@evcp/ui`, with new "component-first, guarded-utilities" governance, coexisting with the legacy `styles.css` so the three apps keep running unchanged.

**Architecture:** Strangler pattern. `packages/ui/theme.css` becomes the single token source (raw reference layer + semantic layer, dark-ready). `packages/ui/styles.css` keeps the legacy CSS but imports Tailwind + `theme.css` and adds a `@theme inline` block that maps Tailwind color/radius/shadow utilities onto the semantic tokens. New presentational primitives are built with `class-variance-authority` and exported from `@evcp/ui`. No surface is migrated in this plan.

**Tech Stack:** Tailwind CSS v4 (CSS-first, `@tailwindcss/vite`), `class-variance-authority`, `tailwind-merge`, `clsx`, React 19, Vite 8, TypeScript 7, oxlint, Prettier, Node `node:test` + `tsx` + `react-dom/server`.

## Global Constraints

- Node >= 22; pnpm workspace (`apps/*`, `packages/*`); package manager `pnpm@11.7.0`.
- Repo lint is **oxlint, not ESLint** — do NOT add `eslint-plugin-tailwindcss`. Governance is enforced by the existing custom script `scripts/quality/check-design-system.mjs` plus `prettier-plugin-tailwindcss` for class ordering.
- Visual language: **Sapphire Clean / Crisp-Dense** — primary blue-600 `#2563eb`, slate neutrals, hairline borders, `8px` card/control radius, minimal shadow.
- Token rule: raw hex values live **only** in the layer-1 block of `theme.css`. Components and app code reference semantic tokens/utilities only.
- Governance model **B (guarded utilities)**: full Tailwind allowed only in `packages/ui`; `apps/*/src` may use layout/spacing utilities but never color/shadow/radius utilities, arbitrary values, raw hex, inline visual `style`, app-local `.css`, or any CSS import other than `@evcp/ui/styles.css`.
- Files capped at 400 lines (ratchet). New primitive files must stay well under.
- Do **not** migrate any surface, and do **not** delete `styles.css`, in this plan.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
packages/ui/
  theme.css                 # NEW — layer-1 raw + layer-2 semantic tokens + reserved .dark
  styles.css                # MODIFIED — imports tailwindcss + theme.css; adds @theme inline; legacy CSS retained
  package.json              # MODIFIED — add cva, tailwind-merge, clsx, tailwindcss
  src/
    cn.ts                   # NEW — clsx + tailwind-merge helper
    primitives/
      button.tsx            # NEW
      card.tsx              # NEW — Card, SectionCard
      badge.tsx             # NEW — Badge, StatusPill, ToneBadge
      input.tsx             # NEW — Input, Field, Select
      table.tsx             # NEW — Table, THead, TRow, TCell
      metric-card.tsx       # NEW
      page-header.tsx       # NEW
    app-shell.tsx           # MODIFIED — rebuilt on primitives + utilities
    index.tsx               # MODIFIED — re-export new primitives alongside legacy
apps/*/vite.config.ts       # MODIFIED — add @tailwindcss/vite plugin
apps/*/package.json         # MODIFIED — add tailwindcss + @tailwindcss/vite (dev)
scripts/quality/check-design-system.mjs   # MODIFIED — add arbitrary-value + color-utility bans for apps
tests/unit/ui-primitives.test.mjs         # NEW — primitive render/variant tests
tests/unit/ui-kitchen-sink.test.mjs       # NEW — kitchen-sink render smoke
packages/ui/src/kitchen-sink.tsx          # NEW — gallery of every primitive
.prettierrc.json            # MODIFIED — register prettier-plugin-tailwindcss
```

---

## Task 1: Install Tailwind v4 and prove the Vite 8 / React 19 pipeline

De-risks the biggest unknown first: Tailwind v4 + `@tailwindcss/vite` on Vite 8 with a workspace-linked CSS entry.

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `apps/admin-web/package.json`, `apps/creator-web/package.json`, `apps/app-store-pwa/package.json`
- Modify: `apps/admin-web/vite.config.ts`, `apps/creator-web/vite.config.ts`, `apps/app-store-pwa/vite.config.ts`
- Modify: `packages/ui/styles.css` (add the tailwind import only)

**Interfaces:**
- Produces: Tailwind utilities compile in all three apps; `packages/ui/styles.css` begins with `@import "tailwindcss";`.

- [ ] **Step 1: Add Tailwind to `@evcp/ui` and each app**

```bash
pnpm --filter @evcp/ui add -D tailwindcss@^4
pnpm --filter @evcp/admin-web add -D tailwindcss@^4 @tailwindcss/vite@^4
pnpm --filter @evcp/creator-web add -D tailwindcss@^4 @tailwindcss/vite@^4
pnpm --filter @evcp/app-store-pwa add -D tailwindcss@^4 @tailwindcss/vite@^4
```

- [ ] **Step 2: Add the `@tailwindcss/vite` plugin to each app's vite config**

Apply this edit to all three `apps/*/vite.config.ts` (they are identical except `allowedHosts`). For `apps/admin-web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: {
    allowedHosts: [".trycloudflare.com", "elephant-capture-thunder-marion.trycloudflare.com", "localhost", "127.0.0.1"],
  },
});
```

- [ ] **Step 3: Add the Tailwind import to `styles.css`**

Edit the top of `packages/ui/styles.css`. It currently starts with a comment then `@import "react-data-grid/lib/styles.css";` on line 3. Prepend the Tailwind import so it is the first statement:

```css
@import "tailwindcss";
@import "react-data-grid/lib/styles.css";
```

(Leave the existing `:root { ... }` block and the rest of the file untouched in this task.)

- [ ] **Step 4: Smoke-test the pipeline in admin-web**

Temporarily add a Tailwind utility to the admin entry to confirm compilation. In `apps/admin-web/src/main.tsx`, wrap the render root with a `className`:

```tsx
createRoot(document.getElementById("root")!).render(
  <div className="bg-white text-slate-900">
    <AdminApp />
  </div>
);
```

Run: `pnpm --filter @evcp/admin-web build`
Expected: build succeeds; the emitted CSS contains a `.bg-white` rule (Tailwind compiled). Verify:

```bash
grep -r "\.bg-white" apps/admin-web/dist/assets/*.css | head -1
```
Expected: one match.

- [ ] **Step 5: Revert the smoke change**

Restore `apps/admin-web/src/main.tsx` to render `<AdminApp />` directly (remove the temporary wrapper div).

- [ ] **Step 6: Verify all three apps still build**

Run: `pnpm --filter @evcp/admin-web --filter @evcp/creator-web --filter @evcp/app-store-pwa build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/styles.css apps/*/package.json apps/*/vite.config.ts pnpm-lock.yaml
git commit -m "build: wire Tailwind v4 into @evcp/ui and app vite configs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Two-layer token system in `theme.css`

**Files:**
- Create: `packages/ui/theme.css`
- Modify: `packages/ui/styles.css` (remove the legacy `:root` token block; import `theme.css`; add `@theme inline`)

**Interfaces:**
- Produces: Tailwind utilities `bg-page`, `bg-surface`, `bg-surface-muted`, `border-border`, `border-border-soft`, `text-body`, `text-muted`, `bg-primary`, `text-primary`, `bg-primary-soft`, `rounded-card`, `rounded-control`, `rounded-pill`, `shadow-card`, `font-sans`, plus status utilities `bg-success`/`text-success` etc. The legacy `--evcp-color-*` custom property names remain unchanged so existing CSS keeps working.

- [ ] **Step 1: Create `packages/ui/theme.css` with both token layers**

```css
/* Horizon design tokens — single source of truth.
   Layer 1 (reference): raw palette values. Raw hex lives ONLY here.
   Layer 2 (semantic): intent-named tokens mapped from layer 1. Reserved .dark block for future theming. */
:root {
  /* Layer 1 — reference palette */
  --ref-blue-600: #2563eb;
  --ref-blue-700: #1d4ed8;
  --ref-blue-100: #dbeafe;
  --ref-sky-400: #38bdf8;
  --ref-slate-50: #f8fafc;
  --ref-slate-100: #f1f5f9;
  --ref-slate-200: #e2e8f0;
  --ref-slate-100-soft: #eef2f7;
  --ref-slate-500: #64748b;
  --ref-slate-900: #0f172a;
  --ref-white: #ffffff;
  --ref-success-bg: #dcfce7;
  --ref-success-text: #166534;
  --ref-warning-bg: #fef3c7;
  --ref-warning-text: #92400e;
  --ref-danger-bg: #fee2e2;
  --ref-danger-text: #991b1b;
  --ref-info-bg: #e0f2fe;
  --ref-info-text: #075985;
  --ref-code-bg: #0b1021;
  --ref-code-text: #e5e7eb;
  --ref-diff-add: #86efac;
  --ref-diff-remove: #fca5a5;
  --ref-ai-user-bg: #f4f1fe;
  --ref-ai-user-text: #4c1d95;

  /* Fonts */
  --evcp-font-thai:
    "LINE Seed Sans TH", "Noto Sans Thai", "IBM Plex Sans Thai", "Sarabun", "Thonburi",
    "Leelawadee UI";
  --evcp-font-latin: Inter, "SF Pro Text", "Segoe UI", system-ui;
  --evcp-font-sans: var(--evcp-font-thai), var(--evcp-font-latin), sans-serif;

  /* Layer 2 — semantic tokens (names kept identical to legacy) */
  --evcp-color-page: var(--ref-slate-100);
  --evcp-color-surface: var(--ref-white);
  --evcp-color-surface-muted: var(--ref-slate-50);
  --evcp-color-border: var(--ref-slate-200);
  --evcp-color-border-soft: var(--ref-slate-100-soft);
  --evcp-color-text: var(--ref-slate-900);
  --evcp-color-muted: var(--ref-slate-500);
  --evcp-color-primary: var(--ref-blue-600);
  --evcp-color-primary-strong: var(--ref-blue-700);
  --evcp-color-primary-soft: var(--ref-blue-100);
  --evcp-color-accent: var(--ref-sky-400);
  --evcp-color-success-bg: var(--ref-success-bg);
  --evcp-color-success-text: var(--ref-success-text);
  --evcp-color-warning-bg: var(--ref-warning-bg);
  --evcp-color-warning-text: var(--ref-warning-text);
  --evcp-color-danger-bg: var(--ref-danger-bg);
  --evcp-color-danger-text: var(--ref-danger-text);
  --evcp-color-info-bg: var(--ref-info-bg);
  --evcp-color-info-text: var(--ref-info-text);
  --evcp-color-code-bg: var(--ref-code-bg);
  --evcp-color-code-text: var(--ref-code-text);
  --evcp-color-diff-add: var(--ref-diff-add);
  --evcp-color-diff-remove: var(--ref-diff-remove);
  --evcp-color-ai-user-bg: var(--ref-ai-user-bg);
  --evcp-color-ai-user-text: var(--ref-ai-user-text);
  --evcp-space-1: 4px;
  --evcp-space-2: 8px;
  --evcp-space-3: 12px;
  --evcp-space-4: 16px;
  --evcp-space-5: 20px;
  --evcp-space-6: 24px;
  --evcp-space-7: 28px;
  --evcp-radius-control: 8px;
  --evcp-radius-card: 8px;
  --evcp-radius-pill: 999px;
  --evcp-shadow-card: 0 10px 24px rgba(15, 23, 42, 0.05);
}

/* Reserved for future dark theme — intentionally empty for now (light-only ships). */
.dark {
}
```

- [ ] **Step 2: Remove the legacy `:root` block from `styles.css` and wire the token pipeline**

In `packages/ui/styles.css`, delete the entire `:root { ... }` block (currently lines 5–48) and replace the top of the file so it reads exactly:

```css
@import "tailwindcss";
@import "react-data-grid/lib/styles.css";
@import "./theme.css";

@theme inline {
  --color-page: var(--evcp-color-page);
  --color-surface: var(--evcp-color-surface);
  --color-surface-muted: var(--evcp-color-surface-muted);
  --color-border: var(--evcp-color-border);
  --color-border-soft: var(--evcp-color-border-soft);
  --color-body: var(--evcp-color-text);
  --color-muted: var(--evcp-color-muted);
  --color-primary: var(--evcp-color-primary);
  --color-primary-strong: var(--evcp-color-primary-strong);
  --color-primary-soft: var(--evcp-color-primary-soft);
  --color-accent: var(--evcp-color-accent);
  --color-success: var(--evcp-color-success-text);
  --color-success-bg: var(--evcp-color-success-bg);
  --color-warning: var(--evcp-color-warning-text);
  --color-warning-bg: var(--evcp-color-warning-bg);
  --color-danger: var(--evcp-color-danger-text);
  --color-danger-bg: var(--evcp-color-danger-bg);
  --color-info: var(--evcp-color-info-text);
  --color-info-bg: var(--evcp-color-info-bg);
  --radius-control: var(--evcp-radius-control);
  --radius-card: var(--evcp-radius-card);
  --radius-pill: var(--evcp-radius-pill);
  --shadow-card: var(--evcp-shadow-card);
  --font-sans: var(--evcp-font-sans);
}
```

(Everything below the former `:root` block stays as-is — it still references `--evcp-*`, now defined in `theme.css`.)

- [ ] **Step 3: Verify tokens compile and legacy look is unchanged**

Run: `pnpm --filter @evcp/admin-web build`
Expected: build succeeds. Confirm a semantic utility and the mapped var both emit:

```bash
grep -rE "\.bg-primary|--color-primary" apps/admin-web/dist/assets/*.css | head -2
```
Expected: `.bg-primary` rule present; it resolves through `var(--evcp-color-primary)`.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/theme.css packages/ui/styles.css
git commit -m "feat(ui): add two-layer token system and @theme utility mapping

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `cn()` helper and the `Button` primitive (TDD)

**Files:**
- Modify: `packages/ui/package.json`
- Create: `packages/ui/src/cn.ts`
- Create: `packages/ui/src/primitives/button.tsx`
- Modify: `packages/ui/src/index.tsx`
- Create: `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Produces: `cn(...classes)` → merged class string. `Button` — props `{ variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" } & React.ButtonHTMLAttributes<HTMLButtonElement>`. Defaults `variant="primary"`, `size="md"`.

- [ ] **Step 1: Add cva/clsx/tailwind-merge to `@evcp/ui`**

```bash
pnpm --filter @evcp/ui add class-variance-authority tailwind-merge clsx
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/ui-primitives.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../packages/ui/src/primitives/button.tsx";

test("Button defaults to the primary variant", () => {
  const html = renderToStaticMarkup(h(Button, null, "บันทึก"));
  assert.match(html, /bg-primary/);
  assert.match(html, /บันทึก/);
});

test("Button danger variant applies danger utilities", () => {
  const html = renderToStaticMarkup(h(Button, { variant: "danger" }, "ลบ"));
  assert.match(html, /bg-danger/);
});

test("Button forwards native button attributes", () => {
  const html = renderToStaticMarkup(h(Button, { type: "submit", disabled: true }, "OK"));
  assert.match(html, /type="submit"/);
  assert.match(html, /disabled/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find module `button.tsx`.

- [ ] **Step 4: Implement `cn()`**

Create `packages/ui/src/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Implement `Button`**

Create `packages/ui/src/primitives/button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-strong",
        secondary: "bg-surface text-body border border-border hover:bg-surface-muted",
        ghost: "bg-transparent text-primary hover:bg-primary-soft",
        danger: "bg-danger text-white hover:opacity-90"
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ variant, size, className, ...rest }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...rest} />;
}
```

Note: `bg-danger` maps to `--color-danger` (danger text color) — for a solid danger button we want the strong red; keep `bg-danger` for now (resolves to `#991b1b`) which reads as a solid danger fill on white text.

- [ ] **Step 6: Re-export from the package index**

In `packages/ui/src/index.tsx`, add near the top after existing imports:

```tsx
export { Button, type ButtonProps } from "./primitives/button";
export { cn } from "./cn";
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/ui/package.json packages/ui/src/cn.ts packages/ui/src/primitives/button.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs pnpm-lock.yaml
git commit -m "feat(ui): add cn() helper and Button primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `Card` and `SectionCard` primitives

**Files:**
- Create: `packages/ui/src/primitives/card.tsx`
- Modify: `packages/ui/src/index.tsx`, `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Produces: `Card` — `{ className?, children } & HTMLAttributes<HTMLDivElement>`; `SectionCard` — `{ title?: ReactNode; actions?: ReactNode; children: ReactNode }`.

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/ui-primitives.test.mjs`:

```js
import { Card, SectionCard } from "../../packages/ui/src/primitives/card.tsx";

test("Card renders a bordered surface", () => {
  const html = renderToStaticMarkup(h(Card, null, "เนื้อหา"));
  assert.match(html, /bg-surface/);
  assert.match(html, /border-border/);
  assert.match(html, /rounded-card/);
});

test("SectionCard renders its title and actions", () => {
  const html = renderToStaticMarkup(
    h(SectionCard, { title: "หัวข้อ", actions: h("span", null, "ปุ่ม") }, "ตาราง")
  );
  assert.match(html, /หัวข้อ/);
  assert.match(html, /ปุ่ม/);
  assert.match(html, /ตาราง/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find `card.tsx`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/primitives/card.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border bg-surface", className)} {...rest} />;
}

export function SectionCard({
  title,
  actions,
  children
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-body">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}
```

- [ ] **Step 4: Re-export**

In `packages/ui/src/index.tsx` add:

```tsx
export { Card, SectionCard } from "./primitives/card";
```

(If a legacy `SectionCard` export already exists in `index.tsx`, remove the legacy definition's export line so the new one wins — the legacy component is superseded here.)

- [ ] **Step 5: Run to verify pass**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/card.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): add Card and SectionCard primitives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `Badge`, `StatusPill`, `ToneBadge` primitives

**Files:**
- Create: `packages/ui/src/primitives/badge.tsx`
- Modify: `packages/ui/src/index.tsx`, `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Consumes: `Status`, `Tone` types from `@evcp/types` (as used by the legacy exports).
- Produces: `Badge` — `{ tone?: Tone } & HTMLAttributes<HTMLSpanElement>`; `StatusPill` — `{ status: Status }`; `ToneBadge` — `{ tone?: Tone; children: ReactNode }`. `Tone = "success" | "warning" | "danger" | "neutral" | "info"`.

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/ui-primitives.test.mjs`:

```js
import { Badge, StatusPill, ToneBadge } from "../../packages/ui/src/primitives/badge.tsx";

test("Badge success tone uses success utilities", () => {
  const html = renderToStaticMarkup(h(Badge, { tone: "success" }, "อนุมัติ"));
  assert.match(html, /bg-success-bg/);
  assert.match(html, /text-success/);
});

test("StatusPill maps healthy to success styling", () => {
  const html = renderToStaticMarkup(h(StatusPill, { status: "healthy" }));
  assert.match(html, /bg-success-bg/);
});

test("ToneBadge defaults to neutral", () => {
  const html = renderToStaticMarkup(h(ToneBadge, null, "ป้าย"));
  assert.match(html, /ป้าย/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find `badge.tsx`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/primitives/badge.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import type { Status } from "@evcp/types";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const badge = cva("inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold", {
  variants: {
    tone: {
      success: "bg-success-bg text-success",
      warning: "bg-warning-bg text-warning",
      danger: "bg-danger-bg text-danger",
      info: "bg-info-bg text-info",
      neutral: "bg-surface-muted text-muted"
    }
  },
  defaultVariants: { tone: "neutral" }
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ tone, className, ...rest }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...rest} />;
}

export function ToneBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

function statusTone(status: Status): Tone {
  if (status === "healthy" || status === "published") return "success";
  if (status === "warning" || status === "pending" || status === "draft" || status === "degraded")
    return "warning";
  if (status === "down") return "danger";
  return "neutral";
}

export function StatusPill({ status }: { status: Status }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}
```

- [ ] **Step 4: Re-export and drop legacy definitions**

In `packages/ui/src/index.tsx`, add:

```tsx
export { Badge, StatusPill, ToneBadge, type Tone, type BadgeProps } from "./primitives/badge";
```

Then remove the legacy `StatusPill`, `ToneBadge`, `statusClassName`, and `Tone` definitions/exports from `index.tsx` (lines around the top) so the new primitives are the single source. Search for `export function StatusPill` and `export function ToneBadge` and delete those blocks.

- [ ] **Step 5: Run to verify pass**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run render-smoke to confirm no surface broke**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs tests/unit/creator-web-render-smoke.test.mjs tests/unit/app-store-pwa-render-smoke.test.mjs`
Expected: PASS (surfaces still import `StatusPill`/`ToneBadge` from `@evcp/ui`, now backed by primitives).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/primitives/badge.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): add Badge/StatusPill/ToneBadge primitives, retire legacy versions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `Input`, `Field`, `Select` primitives

**Files:**
- Create: `packages/ui/src/primitives/input.tsx`
- Modify: `packages/ui/src/index.tsx`, `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Produces: `Input` — `InputHTMLAttributes<HTMLInputElement>`; `Select` — `SelectHTMLAttributes<HTMLSelectElement>`; `Field` — `{ label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode }`.

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/ui-primitives.test.mjs`:

```js
import { Field, Input, Select } from "../../packages/ui/src/primitives/input.tsx";

test("Input renders a bordered control and forwards props", () => {
  const html = renderToStaticMarkup(h(Input, { placeholder: "ชื่อแอป", name: "appName" }));
  assert.match(html, /border-border/);
  assert.match(html, /placeholder="ชื่อแอป"/);
  assert.match(html, /name="appName"/);
});

test("Field renders label bound to control", () => {
  const html = renderToStaticMarkup(
    h(Field, { label: "อีเมล", htmlFor: "email" }, h(Input, { id: "email" }))
  );
  assert.match(html, /อีเมล/);
  assert.match(html, /for="email"/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find `input.tsx`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/primitives/input.tsx`:

```tsx
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../cn";

const control =
  "h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-body outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary-soft";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, className)} {...rest} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-body">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Re-export**

In `packages/ui/src/index.tsx` add:

```tsx
export { Input, Select, Field } from "./primitives/input";
```

- [ ] **Step 5: Run to verify pass**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/input.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): add Input/Select/Field form primitives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Dense `Table` primitives

**Files:**
- Create: `packages/ui/src/primitives/table.tsx`
- Modify: `packages/ui/src/index.tsx`, `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Produces: `Table`, `THead`, `TRow`, `TCell` — thin wrappers over `table`/`thead`/`tr`/`td` with dense Crisp utilities; each accepts its native HTML attributes.

- [ ] **Step 1: Add failing test**

Append to `tests/unit/ui-primitives.test.mjs`:

```js
import { Table, THead, TRow, TCell } from "../../packages/ui/src/primitives/table.tsx";

test("Table renders dense rows with hairline dividers", () => {
  const html = renderToStaticMarkup(
    h(Table, null, h("tbody", null, h(TRow, null, h(TCell, null, "แถว"))))
  );
  assert.match(html, /border-border/);
  assert.match(html, /แถว/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find `table.tsx`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/primitives/table.tsx`:

```tsx
import type { HTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "../cn";

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-sm text-body", className)} {...rest} />;
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted",
        className
      )}
      {...rest}
    />
  );
}

export function TRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border-soft last:border-0", className)} {...rest} />;
}

export function TCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...rest} />;
}
```

- [ ] **Step 4: Re-export**

In `packages/ui/src/index.tsx` add:

```tsx
export { Table, THead, TRow, TCell } from "./primitives/table";
```

- [ ] **Step 5: Run to verify pass**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/table.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): add dense Table primitives

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `MetricCard` primitive

**Files:**
- Create: `packages/ui/src/primitives/metric-card.tsx`
- Modify: `packages/ui/src/index.tsx`, `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Produces: `MetricCard` — `{ label: ReactNode; value: ReactNode; hint?: ReactNode }`.

- [ ] **Step 1: Add failing test**

Append to `tests/unit/ui-primitives.test.mjs`:

```js
import { MetricCard } from "../../packages/ui/src/primitives/metric-card.tsx";

test("MetricCard shows label and value", () => {
  const html = renderToStaticMarkup(h(MetricCard, { label: "แอปที่ใช้งาน", value: "1,284" }));
  assert.match(html, /แอปที่ใช้งาน/);
  assert.match(html, /1,284/);
  assert.match(html, /bg-surface/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find `metric-card.tsx`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/primitives/metric-card.tsx`:

```tsx
import type { ReactNode } from "react";
import { Card } from "./card";

export function MetricCard({
  label,
  value,
  hint
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-2xl font-bold tracking-tight text-primary">{value}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">{label}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
```

- [ ] **Step 4: Re-export and retire legacy `MetricCard`**

In `packages/ui/src/index.tsx` add `export { MetricCard } from "./primitives/metric-card";` and delete the legacy `export function MetricCard(...)` block (search `export function MetricCard`).

- [ ] **Step 5: Run to verify pass + render-smoke**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs tests/unit/admin-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/metric-card.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): add MetricCard primitive, retire legacy version

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `PageHeader` primitive

**Files:**
- Create: `packages/ui/src/primitives/page-header.tsx`
- Modify: `packages/ui/src/index.tsx`, `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Produces: `PageHeader` — `{ eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }`. (Matches the legacy prop shape so surfaces need no change.)

- [ ] **Step 1: Add failing test**

Append to `tests/unit/ui-primitives.test.mjs`:

```js
import { PageHeader } from "../../packages/ui/src/primitives/page-header.tsx";

test("PageHeader renders title, description and actions", () => {
  const html = renderToStaticMarkup(
    h(PageHeader, {
      title: "ภาพรวมระบบ",
      description: "สถานะแพลตฟอร์ม",
      actions: h("button", null, "รีเฟรช")
    })
  );
  assert.match(html, /ภาพรวมระบบ/);
  assert.match(html, /สถานะแพลตฟอร์ม/);
  assert.match(html, /รีเฟรช/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: FAIL — cannot find `page-header.tsx`.

- [ ] **Step 3: Implement**

Create `packages/ui/src/primitives/page-header.tsx`:

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</div>
        )}
        <h1 className="text-xl font-bold tracking-tight text-body">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 4: Re-export and retire legacy `PageHeader`**

In `packages/ui/src/index.tsx` add `export { PageHeader } from "./primitives/page-header";` and delete the legacy `export function PageHeader(...)` block.

- [ ] **Step 5: Run to verify pass + render-smoke**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs tests/unit/admin-web-render-smoke.test.mjs tests/unit/creator-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/page-header.tsx packages/ui/src/index.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): add PageHeader primitive, retire legacy version

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Rebuild `AppShell` on utilities

**Files:**
- Modify: `packages/ui/src/app-shell.tsx`
- Create/append: `tests/unit/ui-primitives.test.mjs`

**Interfaces:**
- Consumes: `NavItem[]` from `@evcp/types` (existing `AppShell` contract). Keep the current prop signature — read `packages/ui/src/app-shell.tsx` first to preserve its exact props.

- [ ] **Step 1: Read the current AppShell contract**

Run: `sed -n '1,60p' packages/ui/src/app-shell.tsx`
Note the exact prop names/types. Preserve them — only the internal markup/classes change.

- [ ] **Step 2: Add a failing test for the new chrome utilities**

Append to `tests/unit/ui-primitives.test.mjs` (adjust the props object to match the contract observed in Step 1):

```js
import { AppShell } from "../../packages/ui/src/app-shell.tsx";

test("AppShell renders sidebar chrome with token utilities", () => {
  const html = renderToStaticMarkup(
    h(
      AppShell,
      { title: "Horizon", navItems: [{ label: "ภาพรวม", route: "/admin" }], userName: "แอดมิน" },
      h("div", null, "เนื้อหา")
    )
  );
  assert.match(html, /ภาพรวม/);
  assert.match(html, /เนื้อหา/);
});
```

- [ ] **Step 3: Run to verify it fails or passes**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs`
Expected: If the props differ from the sample, the test throws — fix the test props to match Step 1's contract, then it should pass against the *current* markup. This test locks behavior before the rewrite.

- [ ] **Step 4: Rewrite AppShell internals with Tailwind utilities**

Replace the JSX/markup inside `packages/ui/src/app-shell.tsx` with token utilities while keeping the same props and structure. Example shell (adapt to the real prop names):

```tsx
export function AppShell({ title, navItems, userName, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-page text-body">
      <aside className="flex w-60 flex-col gap-6 bg-slate-900 px-4 py-6 text-white">
        <strong className="text-sm font-semibold uppercase tracking-wide">{title}</strong>
        <nav className="grid gap-1">
          {navItems.map((item) => (
            <a
              key={item.route}
              href={item.route}
              className="rounded-control px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="flex-1">
        <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3 text-sm text-muted">
          <span>Mock Environment</span>
          <span className="text-body">{userName}</span>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
```

Note: `bg-slate-900` is a Tailwind built-in neutral used only for the dark sidebar chrome inside `@evcp/ui` — permitted because it is inside the design-system package, not app code.

- [ ] **Step 5: Run tests + render-smoke**

Run: `node --import tsx --test tests/unit/ui-primitives.test.mjs tests/unit/admin-web-render-smoke.test.mjs tests/unit/creator-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/app-shell.tsx tests/unit/ui-primitives.test.mjs
git commit -m "feat(ui): rebuild AppShell chrome on Tailwind utilities

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Update governance for guarded utilities

**Files:**
- Modify: `scripts/quality/check-design-system.mjs`
- Modify: `.prettierrc.json`
- Modify: root `package.json` (dev dep)
- Create: `tests/unit/design-system-governance.test.mjs`

**Interfaces:**
- Produces: `check-design-system.mjs` additionally fails app-layer files that contain Tailwind arbitrary values (`-[...]`) or color/shadow/radius color utilities.

- [ ] **Step 1: Add `prettier-plugin-tailwindcss` and register it**

```bash
pnpm add -Dw prettier-plugin-tailwindcss
```

Then edit `.prettierrc.json` to add the plugin (keep all existing keys):

```json
{
  "arrowParens": "always",
  "bracketSpacing": true,
  "endOfLine": "lf",
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "none",
  "useTabs": false,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 2: Write a failing governance test**

Create `tests/unit/design-system-governance.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runCheck(relFile, contents) {
  const root = process.cwd();
  const dir = join(root, "apps/admin-web/src/__govtest__");
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

test("app file with an arbitrary Tailwind value is rejected", () => {
  const result = runCheck("Bad.tsx", 'export const x = <div className="p-[13px]" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /arbitrary/i);
});

test("app file with a color utility is rejected", () => {
  const result = runCheck("BadColor.tsx", 'export const x = <div className="bg-blue-500" />;\n');
  assert.equal(result.ok, false);
  assert.match(result.output, /color utility/i);
});

test("app file with only layout utilities passes", () => {
  const result = runCheck("Good.tsx", 'export const x = <div className="flex gap-4 p-2" />;\n');
  assert.equal(result.ok, true);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --import tsx --test tests/unit/design-system-governance.test.mjs`
Expected: FAIL — the current script does not detect arbitrary values or color utilities.

- [ ] **Step 4: Extend the governance script**

In `scripts/quality/check-design-system.mjs`, add two patterns near the other constants:

```js
const ARBITRARY_VALUE_PATTERN = /className\s*=\s*["'`][^"'`]*-\[[^\]]+\]/;
const COLOR_UTILITY_PATTERN =
  /className\s*=\s*["'`][^"'`]*\b(?:bg|text|border|ring|from|via|to|shadow|rounded|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
```

Then inside the `lines.forEach((line, index) => { ... })` loop (the `SOURCE_EXTENSIONS` branch), add:

```js
if (ARBITRARY_VALUE_PATTERN.test(line)) {
  reportViolation(
    violations,
    file,
    lineNumber,
    "Tailwind arbitrary value detected; use @evcp/ui tokens/components instead"
  );
}

if (COLOR_UTILITY_PATTERN.test(line)) {
  reportViolation(
    violations,
    file,
    lineNumber,
    "color utility detected in app layer; color/shadow/radius must come from @evcp/ui components"
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --import tsx --test tests/unit/design-system-governance.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Confirm real app source still passes governance**

Run: `node scripts/quality/check-design-system.mjs`
Expected: `[design-system] UI governance check passed`. (If a real app file already uses a banned color utility, that is a pre-existing surface issue — record it; do NOT fix surfaces in this plan. If it blocks, scope the offending line into the relevant surface sub-project and temporarily narrow the pattern with a comment.)

- [ ] **Step 7: Commit**

```bash
git add scripts/quality/check-design-system.mjs .prettierrc.json package.json pnpm-lock.yaml tests/unit/design-system-governance.test.mjs
git commit -m "chore(governance): enforce guarded-utility model for app layer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Kitchen-sink preview + final verification

**Files:**
- Create: `packages/ui/src/kitchen-sink.tsx`
- Create: `tests/unit/ui-kitchen-sink.test.mjs`
- Modify: `packages/ui/src/index.tsx`

**Interfaces:**
- Produces: `KitchenSink` — a props-less component rendering one example of every primitive for visual review.

- [ ] **Step 1: Write the render-smoke test first**

Create `tests/unit/ui-kitchen-sink.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KitchenSink } from "../../packages/ui/src/kitchen-sink.tsx";

test("KitchenSink renders every primitive without throwing", () => {
  const html = renderToStaticMarkup(h(KitchenSink));
  for (const needle of ["bg-primary", "rounded-card", "bg-success-bg", "border-border"]) {
    assert.match(html, new RegExp(needle));
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test tests/unit/ui-kitchen-sink.test.mjs`
Expected: FAIL — cannot find `kitchen-sink.tsx`.

- [ ] **Step 3: Implement the gallery**

Create `packages/ui/src/kitchen-sink.tsx`:

```tsx
import { Button } from "./primitives/button";
import { Card, SectionCard } from "./primitives/card";
import { Badge, StatusPill } from "./primitives/badge";
import { Field, Input, Select } from "./primitives/input";
import { Table, THead, TRow, TCell } from "./primitives/table";
import { MetricCard } from "./primitives/metric-card";
import { PageHeader } from "./primitives/page-header";

export function KitchenSink() {
  return (
    <div className="min-h-screen bg-page p-8 text-body">
      <PageHeader
        eyebrow="Design System"
        title="Horizon Primitives"
        description="Sapphire Clean · Crisp / Dense"
        actions={<Button>บันทึก</Button>}
      />
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="แอปที่ใช้งาน" value="1,284" />
        <MetricCard label="Uptime" value="98.6%" />
        <MetricCard label="รออนุมัติ" value="42" />
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>
      <div className="mt-4 flex gap-2">
        <Badge tone="success">อนุมัติ</Badge>
        <Badge tone="warning">ใกล้เต็ม</Badge>
        <Badge tone="danger">ปฏิเสธ</Badge>
        <StatusPill status="healthy" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <SectionCard title="ฟอร์ม">
          <Field label="ชื่อแอป" htmlFor="ks-name" hint="ตัวอย่าง">
            <Input id="ks-name" placeholder="CRM ภายใน" />
          </Field>
          <div className="mt-3">
            <Field label="ฝ่าย" htmlFor="ks-team">
              <Select id="ks-team">
                <option>ฝ่ายขาย</option>
                <option>HR</option>
              </Select>
            </Field>
          </div>
        </SectionCard>
        <Card>
          <Table>
            <THead>
              <TRow>
                <TCell>คำขอ</TCell>
                <TCell>สถานะ</TCell>
              </TRow>
            </THead>
            <tbody>
              <TRow>
                <TCell>เผยแพร่ · CRM</TCell>
                <TCell>
                  <StatusPill status="healthy" />
                </TCell>
              </TRow>
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Re-export**

In `packages/ui/src/index.tsx` add:

```tsx
export { KitchenSink } from "./kitchen-sink";
```

- [ ] **Step 5: Run the kitchen-sink test**

Run: `node --import tsx --test tests/unit/ui-kitchen-sink.test.mjs`
Expected: PASS.

- [ ] **Step 6: Full Foundation verification gate**

Run each and confirm all pass:

```bash
pnpm typecheck
node scripts/quality/check-design-system.mjs
node --import tsx --test tests/unit/ui-primitives.test.mjs tests/unit/ui-kitchen-sink.test.mjs tests/unit/design-system-governance.test.mjs
node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs tests/unit/creator-web-render-smoke.test.mjs tests/unit/app-store-pwa-render-smoke.test.mjs
pnpm --filter @evcp/admin-web --filter @evcp/creator-web --filter @evcp/app-store-pwa build
```
Expected: typecheck clean, governance passes, all unit + render-smoke tests pass, all three apps build (legacy `styles.css` intact — apps unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/kitchen-sink.tsx packages/ui/src/index.tsx tests/unit/ui-kitchen-sink.test.mjs
git commit -m "feat(ui): add kitchen-sink primitive gallery and Foundation verification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** §4 visual language → Tasks 2–10 (tokens + primitives). §5 two-layer tokens → Task 2. §6 governance model B → Task 11. §7 primitives list (Button, Card/SectionCard, Badge/StatusPill/ToneBadge, Input/Field/Select, Table, MetricCard, AppShell, PageHeader) → Tasks 3–10. §8 file structure → all tasks. §9 deps → Tasks 1, 3, 11. §10 acceptance (kitchen-sink + typecheck + governance + 3 apps build + no surface migrated) → Task 12. §11 risk (Vite/Tailwind/React integration) → Task 1 spike.
- **oxlint vs ESLint:** governance enforced via the existing custom script (Task 11), not `eslint-plugin-tailwindcss` — matches Global Constraints.
- **Coexistence:** `styles.css` retained; legacy `--evcp-*` names preserved in `theme.css`; no surface migrated. Matches non-goals.
- **Type consistency:** `Tone` defined in `badge.tsx` and re-exported; `cn` defined in `cn.ts` used by every primitive; `Button`/`Badge` variant prop names consistent across tasks and kitchen-sink.
- **Open verification during execution:** confirm Tailwind v4 processes `@theme inline` inside an imported CSS file (Task 2 Step 3); if not, move the `@theme inline` block ahead of primitive work — it is already in `styles.css`, not `theme.css`, to reduce that risk.
