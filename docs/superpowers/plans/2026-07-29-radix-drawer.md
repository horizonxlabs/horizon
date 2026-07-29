# Radix Drawer (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back the `@evcp/ui` `Drawer` primitive with `@radix-ui/react-dialog` so it gains a real focus trap, scroll lock, Escape/overlay close, `aria-modal`, and focus restoration — with the `Drawer` API, styling, and all consumers unchanged.

**Architecture:** Rewrite `packages/ui/src/primitives/drawer.tsx` as a thin wrapper over `Dialog.Root/Portal/Overlay/Content/Title/Description/Close`, preserving the exact prop shape (`open/onClose/title/description?/footer?/children/size?`) and the exact Tailwind/token class strings. Radix owns modality; `onOpenChange(false)` maps to `onClose()`. Because `Dialog.Content` is portaled, an OPEN drawer renders **empty** under `renderToStaticMarkup`, so SSR tests that asserted open-drawer markup are converted to closed-state / no-throw assertions and the open behaviour is verified visually.

**Tech Stack:** React 19, TypeScript, `@radix-ui/react-dialog@^1.1.6` (already added to `packages/ui/package.json` + `pnpm-lock.yaml` on this branch), Tailwind CSS v4, Node built-in test runner via `node --import tsx --test`.

## Global Constraints

- Branch: `codex/radix-drawer` (off `main`). `@radix-ui/react-dialog@^1.1.6` and its lockfile entry are already committed on this branch — do not re-add or bump.
- The `@evcp/ui` `Drawer` public API is FROZEN: `{ open: boolean; onClose: () => void; title: string; description?: ReactNode; footer?: ReactNode; children: ReactNode; size?: "md" | "lg" | "xl" }`. No new props, no removed props. Its export stays `export { Drawer } from "./primitives/drawer"` in `packages/ui/src/index.tsx`.
- All 9 consumer files under `apps/admin-web/src/features/{ai-governance/drawers,guardrails,knowledge-skills,user-management}` MUST remain byte-for-byte unchanged.
- Preserve these exact class strings: width `max-w-3xl`/`max-w-2xl`/`max-w-md` (xl/lg/md); overlay `bg-[rgba(15,23,42,0.4)]`; panel `border-l border-border bg-surface shadow-card`; header `flex items-start justify-between gap-3 border-b border-border px-5 py-4`; title `text-base font-semibold text-body`; description `text-sm text-muted`; close `rounded-control bg-transparent px-2 py-1 text-lg leading-none text-muted hover:bg-surface-muted`; body `flex-1 overflow-y-auto px-5 py-4`; footer `border-t border-border px-5 py-4`.
- No app-local stylesheets, inline visual styles, or hardcoded colors outside `packages/ui` (`pnpm check:design-system`).
- Files capped at 400 lines.
- **SSR portal fact (verified):** `renderToStaticMarkup(<Drawer open>…)` returns `""` — react-dom/server skips Radix's `Dialog.Portal`. Closed drawers already render `""`. No test may assert open-drawer inner markup via SSR.

---

### Task 1: Rewrite the Drawer primitive on Radix Dialog

**Files:**
- Modify: `packages/ui/src/primitives/drawer.tsx` (full rewrite of the component body; keep the file's single `Drawer` export)
- Test: `tests/unit/ui-drawer.test.mjs` (update the open-state assertions to match the portal-empty SSR reality)

**Interfaces:**
- Consumes: `@radix-ui/react-dialog` (namespace import), `cn` from `../cn`.
- Produces: `export function Drawer(props): JSX.Element` with the frozen prop shape above. Runtime behaviour: renders nothing (empty static markup) under SSR whether open or closed; in the browser, an open drawer mounts a portaled modal dialog anchored right, closing via Escape / overlay click / the × button, each routed through `onClose()`.

- [ ] **Step 1: Update the failing test** — rewrite `tests/unit/ui-drawer.test.mjs` to encode the new SSR contract:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("Drawer renders nothing under SSR whether closed or open (Radix portals to the client DOM)", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  // Closed: Radix Dialog.Root renders nothing.
  const closed = renderToStaticMarkup(
    React.createElement(Drawer, { open: false, onClose() {}, title: "Add provider" }, "body"));
  assert.equal(closed, "");
  // Open: Dialog.Content is portaled, so react-dom/server emits nothing. The open
  // panel's markup and modality (role=dialog, aria-modal, focus trap) are verified
  // visually — they cannot be asserted through this SSR harness.
  const open = renderToStaticMarkup(
    React.createElement(Drawer, { open: true, onClose() {}, title: "Add provider" }, "body"));
  assert.equal(open, "");
});

test("Drawer renders without throwing for every size", async () => {
  const { Drawer } = await import("../../packages/ui/src/primitives/drawer.tsx");
  for (const size of ["md", "lg", "xl"]) {
    assert.doesNotThrow(() =>
      renderToStaticMarkup(
        React.createElement(
          Drawer,
          { open: true, onClose() {}, title: "T", description: "D", footer: "F", size },
          "body"
        )
      )
    );
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/ui-drawer.test.mjs`
Expected: FAIL — the current hand-rolled Drawer renders `role="dialog"` markup for the open case, so `assert.equal(open, "")` fails (open is a non-empty string).

- [ ] **Step 3: Rewrite `packages/ui/src/primitives/drawer.tsx`**

```tsx
import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "../cn";

export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Panel width. Defaults to "md" (the historical width); "lg"/"xl" give content like editors room. */
  size?: "md" | "lg" | "xl";
}) {
  const widthClass = size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Radix drives every dismissal (Escape, overlay click, the × close button); map
        // "closing" back to the caller's onClose. Callers own the `open` prop, so we never
        // request opening here.
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.4)]" />
        <Dialog.Content
          // Radix auto-wires aria-labelledby -> Dialog.Title, and aria-describedby ->
          // Dialog.Description when one is present. When there is no description, pass
          // aria-describedby={undefined} to opt out of Radix's dev-only "missing
          // Description" warning. (Spread so we add the prop ONLY in the no-description
          // case — passing it unconditionally would clobber Radix's auto-wiring.)
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-card outline-none",
            widthClass
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="text-base font-semibold text-body">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close panel"
              className="rounded-control bg-transparent px-2 py-1 text-lg leading-none text-muted hover:bg-surface-muted"
            >
              ×
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="border-t border-border px-5 py-4">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Note: `Dialog.Close` renders a `<button type="button">` by default, so clicking it closes via `onOpenChange(false)` → `onClose()` — no explicit handler needed. `Dialog.Content` receives initial focus on the first focusable descendant, which (given DOM order) is this × button — matching the previous behaviour of focusing the close control.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/unit/ui-drawer.test.mjs`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck `@evcp/ui`**

Run: `pnpm --filter @evcp/ui typecheck`
Expected: no errors. (If `@evcp/ui` has no `typecheck` script, run `pnpm typecheck` and confirm the ui package compiles.)

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/drawer.tsx tests/unit/ui-drawer.test.mjs
git commit -m "feat: back @evcp/ui Drawer with @radix-ui/react-dialog"
```

**Heads-up for the reviewer/next task:** After this task, `tests/unit/admin-web-render-smoke.test.mjs` will be RED — its `ProviderDrawer` open-state probes still assert `html.includes("Add provider")`/`"Edit provider"`, which the portal now renders empty. Task 2 fixes those. Run only `tests/unit/ui-drawer.test.mjs` to gate this task; do not run the full unit suite yet.

---

### Task 2: Realign the ProviderDrawer SSR smoke probes to the portal contract

**Files:**
- Modify: `tests/unit/admin-web-render-smoke.test.mjs` (three `ProviderDrawer` open-render probes at ~lines 143, 180, 198)

**Interfaces:**
- Consumes: nothing new. The affected tests render `<ProviderDrawer open>` which internally renders `<Drawer open>` (now Radix, portaled → empty SSR).
- Produces: three tests that assert the open drawer *constructs and renders without throwing*, with the now-impossible inner-content string checks removed. The source-grep tests in the same file ("exposes OpenRouter and LM Studio presets", "edit-provider wiring") are unchanged — they read source text, not rendered markup, and still cover the drawer's content surface.

- [ ] **Step 1: Run the suite to observe the failures**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs`
Expected: FAIL — the three probes throw "ProviderDrawer did not render its title" / "did not render its edit-mode title" because the portaled content is absent from the static markup.

- [ ] **Step 2: Edit the "renders its open state without throwing" probe (~line 143)**

In the probe string, delete the content assertion line so the `renderToStaticMarkup` call stands alone (the test's real guarantee is `assert.doesNotThrow`):

Remove:
```javascript
    if (!html.includes("Add provider")) throw new Error("ProviderDrawer did not render its title");
```
Keep the `const html = renderToStaticMarkup(...)` line above it (rendering must still be exercised).

- [ ] **Step 3: Edit the "still renders its open state with the picker wired" probe (~line 180)**

Remove the identical line from this probe:
```javascript
    if (!html.includes("Add provider")) throw new Error("ProviderDrawer did not render its title");
```

- [ ] **Step 4: Edit the "renders edit mode with the editProvider prop" probe (~line 198)**

Remove both edit-mode content assertions:
```javascript
    if (!html.includes("Edit provider")) throw new Error("ProviderDrawer did not render its edit-mode title");
    if (!html.includes("Save changes")) throw new Error("ProviderDrawer did not render its edit-mode submit label");
```

Then, so this test keeps asserting the *source* still carries edit-mode wiring (coverage the deleted string checks used to give, now moved to a source grep that doesn't depend on rendering), replace the removed lines' intent by leaving the existing separate test `"ProviderDrawer and AiProvidersConsole source references edit-provider wiring"` as the guarantee — it already asserts `/editProvider/` and `setEditProvider`/`onEdit`. Do NOT add a new test; that existing one covers it.

- [ ] **Step 5: Run the suite to verify it passes**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS (this is the point where Tasks 1+2 together leave the unit suite green).

- [ ] **Step 7: Commit**

```bash
git add tests/unit/admin-web-render-smoke.test.mjs
git commit -m "test: assert ProviderDrawer open-state via no-throw, not portaled markup"
```

---

### Task 3: Typecheck, design-system, and full-suite verification

**Files:**
- None modified. Verification only.

**Interfaces:**
- Consumes: the Radix-backed Drawer (Task 1) and realigned tests (Task 2).
- Produces: green `pnpm check` plus e2e + integration evidence that no consumer regressed.

- [ ] **Step 1: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: no errors across `@evcp/ui` and `admin-web` (the 9 consumers still typecheck against the unchanged `Drawer` prop shape).

- [ ] **Step 2: Design-system gate**

Run: `pnpm check:design-system`
Expected: PASS (no app-local styles / hardcoded colors introduced).

- [ ] **Step 3: Repo check (hygiene + lint + typecheck + unit)**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: e2e + integration suites**

Run: `pnpm test:e2e && pnpm test:integration`
Expected: PASS. (`tests/e2e/keycloak-frontend-contract.test.mjs` reads `AddUserDrawer`/`ManageUserDrawer` *source* — those files are unchanged, so it stays green. The known-flaky `idle sweep` test may need a re-run; a single retry that passes is acceptable.)

- [ ] **Step 5: Commit (only if any lockfile/formatting drift appears)**

```bash
git status --short
# If pnpm reformatted or touched anything, review it, then:
# git add -A && git commit -m "chore: verification drift for Radix Drawer"
```

If `git status` is clean after the runs, skip the commit.

---

### Task 4: Visual + a11y verification of the open drawer (controller-run)

The open drawer cannot be SSR-tested, so its modality is verified in a real browser via a temporary styleguide route. This is a controller/human step — a subagent cannot reliably drive the browser here.

**Files:**
- Temporarily modify (then REVERT, do not commit): `apps/admin-web/src/main.tsx` — add a throwaway `/styleguide` branch that renders a sample `<Drawer open>` with a couple of `<Input>`s and a footer button, plus a background button to tab toward.

- [ ] **Step 1: Add the temp `/styleguide` route** rendering an open `Drawer` (title, description, two inputs, a footer `Button`) alongside a background `<button>Background</button>`, guarded by `window.location.pathname === "/styleguide"`. Import `Drawer`, `Input`, `Button` from `@evcp/ui`.

- [ ] **Step 2: Restart the admin web container to clear stale Vite CSS (macOS bind-mount HMR gotcha)**

Run: `docker restart evcp-admin-web`
Then open `http://localhost:<admin port>/styleguide` (per `EVCP_ADMIN_WEB_URL`).

- [ ] **Step 3: Verify by interaction** (use Chrome automation or manual): the panel is right-anchored with the correct width; Tab cycles *within* the drawer and never reaches the "Background" button (focus trap); Escape closes it; clicking the dimmed overlay closes it; the × closes it; the page behind is scroll-locked; the header/body/footer and colors look identical to before.

- [ ] **Step 4: Revert the temp route**

```bash
git checkout apps/admin-web/src/main.tsx
```
Confirm `git status` shows no `main.tsx` change. Nothing to commit for this task.

---

## Notes for the executor

- The `package.json` / `pnpm-lock.yaml` Radix-dialog additions are already committed on this branch (alongside the earlier Select #167 and Tabs #168 Radix deps). A trivial `package.json`/lockfile conflict may appear when this branch later merges — keep every `@radix-ui/*` dependency line.
- Do not touch any of the 9 consumer files. If a consumer appears to need a change, stop — the API is frozen and a required consumer change means the wrapper diverged from spec.
