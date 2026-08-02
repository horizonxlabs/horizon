# Radix UI Adoption — Phase 2 (Tabs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `@evcp/ui` `Tabs` primitive keyboard navigation (arrow keys, Home/End, roving tabindex) via `@radix-ui/react-roving-focus`, keeping its API, ARIA, and styling.

**Architecture:** Wrap the existing `role="tablist"` bar in `RovingFocusGroup.Root` and each `role="tab"` button in `RovingFocusGroup.Item` (`asChild`), keeping the `Tabs`/`TabItem` props and class strings. Native buttons keep click/Enter/Space activation; Radix adds arrow/Home/End focus movement and roving tabindex. No consumer changes.

**Tech Stack:** React 19, `@radix-ui/react-roving-focus` 1.1.x, Tailwind + cn (`@evcp/ui`). Tests: `renderToStaticMarkup`.

## Global Constraints

- **No API/consumer change:** `Tabs<T>({ items: TabItem<T>[], active: T, onSelect: (id:T)=>void, "aria-label"? })`; `TabItem<T> = { id: T; label: ReactNode }`. The 3 consumers (`AiProvidersConsole`, `KnowledgeSkillsConsole`, `WorkspacePage`) are untouched.
- Keep `role="tablist"`/`role="tab"`, `aria-selected`, and the exact tablist/tab class strings.
- Manual activation (arrow moves focus only; Enter/Space/click selects) — the native `<button>` provides it.
- `pnpm check` + e2e + integration pass; design-system clean.
- RovingFocus SSRs statically (verified: it renders `data-orientation` + `data-radix-collection-item` + `tabindex` and does not throw under `renderToStaticMarkup`).

---

### Task 1: Add the `@radix-ui/react-roving-focus` dependency

**Files:**
- Modify: `packages/ui/package.json` (+ `pnpm-lock.yaml`)

- [ ] **Step 1:** Ensure `packages/ui/package.json` `"dependencies"` contains (alphabetical, before `class-variance-authority`):

```json
    "@radix-ui/react-roving-focus": "^1.1.4",
```

- [ ] **Step 2:** Run `pnpm install`. Expected: resolves `@radix-ui/react-roving-focus` (1.1.x, React 19 compatible), no failing peer errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/package.json pnpm-lock.yaml
git commit -m "build(ui): add @radix-ui/react-roving-focus dependency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Back `Tabs` with RovingFocus (preserve API)

**Files:**
- Modify: `packages/ui/src/primitives/tabs.tsx`
- Test: `tests/unit/ui-tabs-radix.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui-tabs-radix.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { Tabs } from "../../packages/ui/src/index.tsx";

function render(active) {
  return renderToStaticMarkup(
    h(Tabs, {
      items: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      active,
      onSelect: () => {},
      "aria-label": "Views"
    })
  );
}

test("Tabs is RovingFocus-backed and preserves tablist structure + active styling", () => {
  const html = render("b");
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-label="Views"/);
  assert.match(html, /data-radix-collection-item/); // RovingFocus items (absent before)
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /aria-selected="true"/); // active tab
  assert.match(html, /border-primary/); // active tab styling preserved
});

test("Tabs renders without throwing under static rendering", () => {
  assert.doesNotThrow(() => render("a"));
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --import tsx --test tests/unit/ui-tabs-radix.test.mjs`
Expected: FAIL — the current hand-rolled tablist has no `data-radix-collection-item`.

- [ ] **Step 3: Rewrite `tabs.tsx`**

Replace the entire contents of `packages/ui/src/primitives/tabs.tsx` with:

```tsx
import * as RovingFocusGroup from "@radix-ui/react-roving-focus";
import type { ReactNode } from "react";
import { cn } from "../cn";

export type TabItem<T extends string> = { id: T; label: ReactNode };

// The @evcp/ui tab bar. Radix RovingFocusGroup provides WAI-ARIA keyboard
// navigation (Left/Right/Home/End, roving tabindex, looping) for the list; the
// native <button>s keep click/Enter/Space activation (manual activation, so
// arrow keys move focus without triggering a consumer's panel switch). This is a
// list-only tab bar: consumers render their panels separately from `active`.
export function Tabs<T extends string>({
  items,
  active,
  onSelect,
  "aria-label": ariaLabel
}: {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  "aria-label"?: string;
}) {
  return (
    <RovingFocusGroup.Root asChild orientation="horizontal" loop>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <RovingFocusGroup.Item asChild key={item.id} active={selected}>
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "-mb-px rounded-none border-b-2 bg-transparent px-4 py-2 text-sm font-medium outline-none",
                  selected ? "border-primary text-primary" : "border-transparent text-muted hover:text-body"
                )}
              >
                {item.label}
              </button>
            </RovingFocusGroup.Item>
          );
        })}
      </div>
    </RovingFocusGroup.Root>
  );
}
```

- [ ] **Step 4: Run test + render-smoke**

Run:
```bash
node --import tsx --test tests/unit/ui-tabs-radix.test.mjs tests/unit/creator-web-render-smoke.test.mjs
```
Expected: PASS. The render-smoke pages mounting `<Tabs>` (WorkspacePage, and via admin consoles if covered) render without throwing.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @evcp/ui typecheck && pnpm --filter @evcp/admin-web typecheck && pnpm --filter @evcp/creator-web typecheck`
Expected: clean — `Tabs`/`TabItem` unchanged, so consumers still typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/tabs.tsx tests/unit/ui-tabs-radix.test.mjs
git commit -m "feat(ui): back Tabs with @radix-ui/react-roving-focus (keyboard nav, same API)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full gate + visual/keyboard verify

- [ ] **Step 1: Full gate**

Run: `pnpm check && pnpm test:e2e && pnpm test:integration`
Expected: all pass (known flaky `idle sweep` excepted). Design-system clean; no consumer changed.

- [ ] **Step 2: Visual + keyboard (temporary styleguide route)**

Temporarily render `KitchenSink` from `@evcp/ui` in `apps/creator-web/src/main.tsx` on `…/styleguide` (as done for the Select verification) — add a `<Tabs>` sample to the styleguide if KitchenSink lacks one — `docker restart evcp-creator-web`, open `http://localhost:9800/creator/styleguide`, and confirm: Left/Right arrow move focus between tabs, Home/End jump to first/last, only the active tab is a Tab-stop, Enter/Space/click selects, and the bar looks unchanged. **Revert `main.tsx`** (and any KitchenSink sample) and restart before finishing.

- [ ] **Step 3: Commit any fixups** (only if the gate required a change).

---

## Self-Review

**Spec coverage:** dependency → Task 1; RovingFocus wrap preserving `Tabs`/`TabItem`/ARIA/styling with manual activation → Task 2; keyboard nav + no consumer change verified via render-smoke/typecheck/full suites/visual → Tasks 2–3. RovingFocus-over-`react-tabs` rationale is in the spec; the plan keeps the list-only structure.

**Placeholder scan:** Task 2 carries the complete new file + a real red→green (the `data-radix-collection-item` marker RovingFocus adds, absent from the current markup). No vague handling.

**Type consistency:** `TabItem<T>`/`Tabs` generics and props are byte-identical to the current export; `RovingFocusGroup.Root`/`.Item` come from the namespace import of `@radix-ui/react-roving-focus`; `active`/`onSelect` map to the RovingFocus `active` tab-stop + the native button `onClick`.
