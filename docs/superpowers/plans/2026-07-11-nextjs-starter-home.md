# Next.js Starter Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the generated app's existing starter message in a polished, responsive gradient landing state.

**Architecture:** Keep the change self-contained in the editable `app/page.tsx` golden-template file. A semantic `main` element owns the full viewport and a local style block defines all visual presentation, so new generated apps need no additional dependencies or shared CSS.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Node test runner.

---

### Task 1: Verify the starter-home contract

**Files:**
- Modify: `tests/unit/workspace-golden-template.test.mjs`
- Test: `tests/unit/workspace-golden-template.test.mjs`

- [ ] **Step 1: Add a failing template-content test**

Assert that `app/page.tsx` contains the unchanged starter message and the `starter-home` class that defines the intended full-page layout.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --import tsx --test tests/unit/workspace-golden-template.test.mjs`

Expected: FAIL because `starter-home` is not yet present.

- [ ] **Step 3: Implement the minimal starter home**

Replace the bare template page with a full-height `main` using `starter-home`, preserve the exact message inside a readable panel, and add a local scoped style block for a dark indigo gradient and responsive spacing.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --import tsx --test tests/unit/workspace-golden-template.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run type and build validation**

Run: `pnpm --dir templates/nextjs-base build`

Expected: Next.js build succeeds when template dependencies are installed; otherwise report the dependency environment blocker after the focused test passes.
