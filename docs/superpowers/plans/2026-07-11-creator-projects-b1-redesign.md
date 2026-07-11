# Creator Projects B1 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/creator/projects` as the approved B1 AI Creation Studio while preserving the shared light sidebar and all existing project flows.

**Architecture:** Keep `CreatorShell`/`AppShell` as the single navigation owner and restructure only `ProjectsPage` content. Extend the shared `packages/ui/styles.css` design system for the B1 page composition, then protect the markup and responsive styling contracts with focused Node tests plus the existing real-hook render smoke test.

**Tech Stack:** React 19, TypeScript, Lucide React, shared EVCP CSS design system, Node test runner with `tsx`.

---

### Task 1: Lock the B1 page contract with a failing render test

**Files:**
- Modify: `tests/unit/creator-web-render-smoke.test.mjs`
- Test: `tests/unit/creator-web-render-smoke.test.mjs`

- [ ] **Step 1: Add a focused failing test for the approved structure and Thai copy**

Add this test after the generic page render loop:

```javascript
test("ProjectsPage renders the B1 AI studio inside the shared Creator shell", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));

  assert.match(html, /class="[^"]*hz-projects-studio/);
  assert.match(html, /วันนี้อยากสร้างอะไร/);
  assert.match(html, /สร้างด้วย AI/);
  assert.match(html, /โปรเจกต์ล่าสุด/);
  assert.match(html, /aria-label="ค้นหาโปรเจกต์"/);
  assert.match(html, /aria-label="รายการโปรเจกต์"/);
  assert.doesNotMatch(html, /Updated \d|อัปเดตเมื่อ/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
```

Expected: FAIL because `hz-projects-studio` and the approved B1 Thai copy are not rendered yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/creator-web-render-smoke.test.mjs
git commit -m "test: define creator projects B1 contract"
```

### Task 2: Implement the B1 Projects page structure

**Files:**
- Modify: `apps/creator-web/src/pages/ProjectsPage.tsx`
- Test: `tests/unit/creator-web-render-smoke.test.mjs`

- [ ] **Step 1: Update the hero hierarchy without changing the creation flow**

Change the page root to `hz-home hz-projects-studio`. Keep `startFromPrompt`, `handleCreateFromPrompt`, and suggestion behavior intact. Replace the hero copy and CTA with:

```tsx
<span className="hz-hero-eyebrow">
  <Sparkles size={14} aria-hidden="true" />
  Horizon AI Builder
</span>
<h1 className="hz-hero-title">วันนี้อยากสร้างอะไร?</h1>
<p className="hz-hero-sub">
  อธิบาย workflow ผู้ใช้งาน และผลลัพธ์ที่ต้องการ แล้วให้ Horizon ช่วยสร้างแอปภายในองค์กร
</p>
```

Use `สร้างด้วย AI` for the primary CTA and Thai accessible labels for the prompt and suggestions.

- [ ] **Step 2: Recompose the projects toolbar and list**

Rename the section heading to `โปรเจกต์ล่าสุด`, retain the count, and keep local filtering. Use these semantic labels:

```tsx
<input aria-label="ค้นหาโปรเจกต์" placeholder="ค้นหาโปรเจกต์…" />
<div className="hz-grid" aria-label="รายการโปรเจกต์">
```

Do not add fabricated timestamps. Preserve `handleSelectProject(project, "workspace")` and `aria-current`.

- [ ] **Step 3: Strengthen project-card metadata**

Render the textual status inside a dedicated `hz-project-status` element and keep the app type and owner visible in `hz-card-meta`. Use the deterministic thumbnail tone and project initials already provided by the file.

- [ ] **Step 4: Improve the empty states**

Keep separate messages for an empty project collection and an empty search result. The empty collection points users back to the prompt; the search state echoes the query safely through React text rendering.

- [ ] **Step 5: Run the focused render test**

Run:

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
```

Expected: PASS, including the dedicated B1 assertions and all existing page render cases.

- [ ] **Step 6: Commit the page structure**

```bash
git add apps/creator-web/src/pages/ProjectsPage.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: redesign creator projects studio"
```

### Task 3: Lock responsive shared-style requirements with a failing test

**Files:**
- Create: `tests/unit/creator-projects-design-contract.test.mjs`
- Modify: `packages/ui/styles.css`
- Test: `tests/unit/creator-projects-design-contract.test.mjs`

- [ ] **Step 1: Add a CSS contract test**

Create the test with these checks:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../../packages/ui/styles.css", import.meta.url), "utf8");

test("creator projects B1 styles cover studio, status, focus, and responsive layouts", () => {
  for (const selector of [
    ".hz-projects-studio",
    ".hz-project-status",
    ".hz-card:focus-visible",
    ".hz-prompt-cta:disabled"
  ]) {
    assert.ok(css.includes(selector), `missing shared selector: ${selector}`);
  }
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
```

- [ ] **Step 2: Run the CSS contract test and verify it fails**

Run:

```bash
node --test tests/unit/creator-projects-design-contract.test.mjs
```

Expected: FAIL because the new B1 root, status, disabled, and responsive contracts do not all exist.

- [ ] **Step 3: Implement the shared B1 styling**

Update the existing `hz-home`, hero, prompt, chips, projects toolbar, grid, card, status, and empty selectors in `packages/ui/styles.css` rather than adding duplicate style blocks. Required behavior:

- left-aligned hero with no oversized decorative container;
- prompt surface as the strongest elevation on the page;
- three-column desktop project grid, two columns at 900px, one column at 640px;
- visible `:focus-visible` treatment on cards and controls;
- semantic status badge surface with readable text;
- disabled CTA state;
- reduced-motion override for transitions/animations;
- no app-local stylesheet, inline style, or new hardcoded production color outside shared tokens.

- [ ] **Step 4: Run the CSS and repository design-system checks**

Run:

```bash
node --test tests/unit/creator-projects-design-contract.test.mjs
pnpm check:design-system
```

Expected: both PASS.

- [ ] **Step 5: Commit shared styling and its contract test**

```bash
git add packages/ui/styles.css tests/unit/creator-projects-design-contract.test.mjs
git commit -m "style: polish creator projects B1 layout"
```

### Task 4: Verify behavior, responsiveness, and repository quality

**Files:**
- Modify only if verification reveals a scoped defect: `apps/creator-web/src/pages/ProjectsPage.tsx`
- Modify only if verification reveals a scoped defect: `packages/ui/styles.css`
- Test: `tests/unit/creator-web-render-smoke.test.mjs`
- Test: `tests/unit/creator-projects-design-contract.test.mjs`

- [ ] **Step 1: Format only the changed implementation files**

```bash
pnpm exec prettier --write apps/creator-web/src/pages/ProjectsPage.tsx packages/ui/styles.css tests/unit/creator-web-render-smoke.test.mjs tests/unit/creator-projects-design-contract.test.mjs
```

- [ ] **Step 2: Run focused unit tests**

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
node --test tests/unit/creator-projects-design-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run Creator typecheck and build**

```bash
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
```

Expected: PASS.

- [ ] **Step 4: Run changed-file quality checks**

```bash
pnpm check:changed --base HEAD~2
```

Expected: PASS with no design-system, formatting, lint, type, or size regression.

- [ ] **Step 5: Visually verify the authenticated page at three widths**

Start the existing Creator app and visit `/creator/projects`. Verify these concrete states:

1. Desktop 1440px: shared light sidebar is visible, prompt and first project row fit without horizontal scrolling.
2. Tablet 900px: shared navigation compacts and project cards use two columns.
3. Mobile 390px: navigation is available through the shared drawer, prompt controls stack, and project cards use one column.
4. Search with no matches: Thai empty result is visible and the query remains editable.
5. Keyboard: Tab reaches prompt, suggestions, search, and each project card with visible focus.

- [ ] **Step 6: Commit any verification-only fixes**

If Step 5 required scoped corrections:

```bash
git add apps/creator-web/src/pages/ProjectsPage.tsx packages/ui/styles.css
git commit -m "fix: refine creator projects responsive states"
```

If no corrections were required, do not create an empty commit.
