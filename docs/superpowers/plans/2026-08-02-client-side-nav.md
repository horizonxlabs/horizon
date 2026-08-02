# Client-side Shell Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clicking the admin/creator `AppShell` sidebar swaps panels client-side (history API) — no full reload, no white flash.

**Architecture:** `AppShell` gains an opt-in `onNavigate` prop and intercepts plain left-clicks on internal nav links; each console holds the current path in reactive state (`pushState` on navigate, `popstate` for back/forward) and renders its panel from that state.

**Tech Stack:** React, `@evcp/ui` `AppShell`, Node test runner. No new deps, no router library.

## Global Constraints

- `onNavigate` is **opt-in**: with no `onNavigate`, `AppShell` behaves exactly as today (native `<a href>` full navigation) — cannot regress the store or any unwired surface.
- The nav `<a>` keeps `href={item.route}` and `aria-current`; interception applies only to a plain left-click (`button === 0`, no `ctrl/meta/shift/alt`, not already default-prevented) so middle/ctrl/cmd-click still open a new tab.
- No styling change (design-system stays clean); files stay ≤ 400 lines.
- Branch: `codex/client-side-nav` (off `codex/in-ui-domain`).

---

### Task 1: `AppShell` opt-in `onNavigate` + `isPlainLeftClick` helper

**Files:**
- Modify: `packages/ui/src/app-shell.tsx`
- Test: `tests/unit/ui-primitives.test.mjs` (extend) or a new `tests/unit/app-shell-nav.test.mjs`

**Interfaces:**
- Produces: `AppShell` accepts `onNavigate?: (route: string) => void`; exports `isPlainLeftClick(event): boolean`.

- [ ] **Step 1: Write the failing test** (new `tests/unit/app-shell-nav.test.mjs`):

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { AppShell, isPlainLeftClick } from "../../packages/ui/src/app-shell.tsx";

test("isPlainLeftClick accepts a plain left click", () => {
  assert.equal(isPlainLeftClick({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false }), true);
});

test("isPlainLeftClick rejects modified / non-left / prevented clicks", () => {
  for (const mod of [{ button: 1 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) {
    assert.equal(isPlainLeftClick({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...mod }), false);
  }
});

test("AppShell still renders nav items as anchors with href (a11y / fallback preserved)", () => {
  const html = renderToStaticMarkup(
    h(AppShell, { title: "T", userName: "U", navItems: [{ label: "Home", route: "/admin", icon: "dashboard" }] }, h("div", null, "x"))
  );
  assert.match(html, /href="\/admin"/);
});
```

- [ ] **Step 2: Run, verify red** (`isPlainLeftClick` not exported yet).

- [ ] **Step 3: Implement in `app-shell.tsx`**:
  - Add the exported helper:
    ```ts
    export function isPlainLeftClick(event: {
      button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean;
    }): boolean {
      return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
    }
    ```
  - Add `onNavigate?: (route: string) => void` to the destructured props + the props type.
  - On the sidebar item `<a>` (around line 282-300), add:
    ```tsx
    onClick={(event) => {
      if (onNavigate && isPlainLeftClick(event)) {
        event.preventDefault();
        onNavigate(item.route);
      }
    }}
    ```
    Keep `href={item.route}` and `aria-current` exactly as-is.

- [ ] **Step 4: Green + typecheck** (`pnpm --filter @evcp/ui typecheck`). **Step 5: `pnpm check`.** **Step 6: Commit** — `feat(ui): AppShell opt-in onNavigate for client-side sidebar nav`

---

### Task 2: admin-web — reactive path + `onNavigate`

**Files:**
- Modify: `apps/admin-web/src/features/admin-console/AdminConsole.tsx`
- Test: `tests/unit/admin-web-render-smoke.test.mjs` (still renders)

**Interfaces:** consumes `AppShell` `onNavigate` (Task 1).

- [ ] **Step 1:** In `AdminConsole`, replace the one-shot `window.location.pathname` read with reactive state:
  ```tsx
  const [path, setPath] = useState(() => (typeof window === "undefined" ? "/admin" : window.location.pathname));
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (route) => {
    if (typeof window !== "undefined" && route !== window.location.pathname) window.history.pushState(null, "", route);
    setPath(route);
  };
  const page = pageFromPath(path);
  ```
  Pass `onNavigate={navigate}` to `<AppShell …>`. (Keep the existing `pageFromPath` and panel selection; they now read `path`.)
- [ ] **Step 2:** Ensure `useState`/`useEffect` are imported. Run the admin render-smoke — still renders without throwing (SSR path uses the `"/admin"` default; no effects run under `renderToStaticMarkup`).
- [ ] **Step 3: `pnpm check`.** **Step 4: Commit** — `feat(admin-web): client-side sidebar navigation (no reload/flash)`

---

### Task 3: creator-web — reactive path + `onNavigate`

**Files:**
- Modify: `apps/creator-web/src/app/use-creator-app.tsx`, `apps/creator-web/src/features/projects/CreatorShell.tsx`
- Test: `tests/unit/creator-web-render-smoke.test.mjs` (still renders)

**Interfaces:** the hook exposes `onNavigate` + a reactive `creatorPage`; `CreatorShell` passes `onNavigate` to its `AppShell`.

- [ ] **Step 1:** `use-creator-app.tsx` already listens to `popstate` and reads `creatorPageFromPath(window.location.pathname)`. Add a reactive `path` state seeded from `window.location.pathname`; have the EXISTING popstate handler also `setPath(window.location.pathname)` (reuse it — do not add a second listener); add `onNavigate = (route) => { if (route !== window.location.pathname) window.history.pushState(null, "", route); setPath(route); }`. Derive the sidebar `creatorPage` from `creatorPageFromPath(path)` instead of the direct `window.location.pathname` read. Return `onNavigate` from the hook.
- [ ] **Step 2:** `CreatorShell.tsx` — pass `onNavigate={app.onNavigate}` to its `<AppShell …>`.
- [ ] **Step 3:** Run creator render-smoke — still renders. Verify project-selection navigation (the hook's existing pushState paths) still works and does not double-handle `popstate`.
- [ ] **Step 4: `pnpm check`.** **Step 5: Commit** — `feat(creator-web): client-side sidebar navigation (no reload/flash)`

---

### Task 4: Live no-flash verification (controller-run, gated)

- [ ] **Step 1:** Rebuild `evcp-local/evcp-admin-web` + `evcp-local/evcp-creator-web` from this branch and `docker service update` those two services on the running stack (or redeploy).
- [ ] **Step 2:** Load `/admin`, set `window.__navProbe = Date.now()` in the console, click through several menu items. Confirm: the URL changes, the panel swaps, and `window.__navProbe` **survives** (proves no document reload / bundle re-fetch). Confirm ctrl/cmd-click still opens a new tab. Repeat the spot-check on `/creator`.
- [ ] **Step 3:** Note the result (no flash / reload) and revert the throwaway env/probe. Commit any doc note if warranted.

---

## Self-review notes

- **Coverage:** AppShell + helper (T1), admin wiring (T2), creator wiring (T3), live (T4). Matches spec.
- **Opt-in safety:** without `onNavigate`, `AppShell` is unchanged (native `<a href>`), so the store and any unwired surface can't regress — asserted by the T1 render-smoke (href preserved).
- **No double popstate in creator:** T3 reuses the existing listener rather than adding a competing one.
