# Creator Design-System Unification — Phase 2 (Projects Landing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the projects-landing create CTA and search field to `@evcp/ui` `Button` and `Input`.

**Architecture:** One-file edit of `ProjectsPage.tsx`: swap the raw `hz-prompt-cta` button and the `hz-search` wrapped input for the `@evcp/ui` `Button`/`Input` primitives. Cards, hero text, grid, empty state, and filter logic are untouched.

**Tech Stack:** React + Vite (creator-web), `@evcp/ui` primitives, lucide-react. Test: Node built-in runner via `renderToStaticMarkup`.

## Global Constraints

- No app-local stylesheets/inline styles/hardcoded colors — use `@evcp/ui` primitives (enforced by `pnpm check:design-system`).
- Keep `hz-card` cards, `hz-hero` text, `hz-grid`, `hz-empty`, and the `query`/`setQuery` filter logic unchanged.
- `pnpm check` passes; no unused imports; no file exceeds its baseline.

---

### Task 1: Convert the CTA and search to primitives

**Files:**
- Modify: `apps/creator-web/src/features/projects/ProjectsPage.tsx`
- Test: `tests/unit/creator-web-render-smoke.test.mjs` (append one assertion)

**Interfaces:**
- Consumes: `@evcp/ui` `Button({ variant })`, `Input(...InputHTMLAttributes)`; `app.setIsCreateProjectDialogOpen`, `query`/`setQuery` (unchanged).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/creator-web-render-smoke.test.mjs`:

```js
test("ProjectsPage CTA and search use @evcp/ui primitives", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));
  // search Input carries the primitive control token, not the legacy raw input
  assert.match(html, /aria-label="ค้นหาโปรเจกต์"[^>]*focus:ring-primary-soft|focus:ring-primary-soft[^>]*aria-label="ค้นหาโปรเจกต์"/);
  // the CTA renders and no longer uses the bespoke hz-prompt-cta class
  assert.match(html, /สร้าง Project ใหม่/);
  assert.doesNotMatch(html, /hz-prompt-cta/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`
Expected: FAIL — the current page uses `hz-prompt-cta` and a raw `<input>` (no `focus:ring-primary-soft` on the search field).

- [ ] **Step 3: Edit ProjectsPage.tsx**

In `apps/creator-web/src/features/projects/ProjectsPage.tsx`:

1. Change the imports at the top:

```tsx
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "@evcp/ui";
import { CreatorShell } from "./CreatorShell";
import type { useCreatorApp } from "@/app/use-creator-app";
import type { CreatorProjectView } from "@/shared/types";
import type { CreatorPage } from "@/app/routes";
```

(`Search` is removed; `Button`/`Input` added.)

2. Replace the CTA button:

```tsx
            <button
              type="button"
              className="hz-prompt-cta"
              onClick={() => setIsCreateProjectDialogOpen(true)}
            >
              <Plus size={16} aria-hidden="true" />
              <span>สร้าง Project ใหม่</span>
            </button>
```

with:

```tsx
            <Button variant="primary" onClick={() => setIsCreateProjectDialogOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              <span>สร้าง Project ใหม่</span>
            </Button>
```

3. Replace the search box:

```tsx
                <div className="hz-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    placeholder="ค้นหาโปรเจกต์…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="ค้นหาโปรเจกต์"
                  />
                </div>
```

with:

```tsx
                <Input
                  placeholder="ค้นหาโปรเจกต์…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="ค้นหาโปรเจกต์"
                />
```

Leave everything else (hero, `hz-projects`, `hz-grid`, `hz-card`, `hz-empty`,
filter logic) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`
Expected: PASS (the new test plus the existing render-smoke tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @evcp/creator-web typecheck`
Expected: clean — no unused imports (`Search` removed), `Button`/`Input` resolve.

- [ ] **Step 6: Commit**

```bash
git add apps/creator-web/src/features/projects/ProjectsPage.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: use @evcp/ui Button + Input for the projects landing CTA and search

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Full gate + visual verify

**Files:** none (verification only).

- [ ] **Step 1: Run the quality gate**

Run: `pnpm check`
Expected: design-system, oxlint (no unused `Search` import), typecheck, unit tests pass. (Known pre-existing/flaky: `POST /setup/initialize …`; confirm no *new* failures.)

- [ ] **Step 2: Visual verify**

Run `docker restart evcp-creator-web`, wait for `VITE … ready`, open `/creator/projects`, and confirm the "สร้าง Project ใหม่" CTA is the design-system primary button and the search field is a design-system input (focus ring) matching the wizard/admin.

- [ ] **Step 3: Commit any gate fixups** (only if the gate required a change)

```bash
git add -A
git commit -m "chore: satisfy quality gate for projects-landing primitives"
```

---

## Self-Review

**Spec coverage:**
- CTA → `Button variant="primary"` → Task 1 Step 3.2.
- Search → bare `Input` (drop `hz-search`/`Search` icon) → Task 1 Step 3.3 + import change.
- Cards/hero/grid/empty/filter unchanged → Global Constraints; Task 1 leaves them.
- Testing (render-smoke CTA + search primitive token; typecheck; design-system; visual) → Tasks 1–2.

**Placeholder scan:** none — exact before/after code shown.

**Type consistency:** `Button`/`Input` are used exactly as `@evcp/ui` exports them; `onClick`/`value`/`onChange`/`placeholder`/`aria-label` are standard props. `setIsCreateProjectDialogOpen`, `query`, `setQuery` are unchanged from the current file.
