# Radix UI Adoption — Phase 1 (Select) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back the `@evcp/ui` `Select` primitive with `@radix-ui/react-select` while keeping its public API, styling, and every call site unchanged.

**Architecture:** Rewrite only the internals of `select.tsx` on Radix Select (Root/Trigger/Value/Icon/Portal/Content/Viewport/Item), reusing `parseSelectOptions` for the `<option>` children and keeping `triggerClasses`. `SelectProps` and the 15 consumers are untouched; Radix owns keyboard/focus/ARIA.

**Tech Stack:** React 19, `@radix-ui/react-select`, Tailwind v4 + cva + cn (`@evcp/ui`). Tests: Node built-in runner via `renderToStaticMarkup`.

## Global Constraints

- **No consumer changes, no API change:** `SelectProps` keeps `value`, `onChange: (e:{target:{value:string}})=>void`, `disabled`, `required`, `className`, `children` (`<option>`s), `id`, `name`, `aria-label`.
- Keep `select-helpers.ts` exports intact (`parseSelectOptions`, `nextEnabledIndex`, `selectedLabel`, `SelectItem`) — `nextEnabledIndex`/`selectedLabel` are still covered by `tests/unit/ui-select-helpers.test.mjs`; `select.tsx` simply stops importing them.
- Keep the `triggerClasses` string verbatim so the trigger looks identical.
- No app-local styles; Content/Item styled with existing tokens.
- `pnpm check` + e2e + integration pass; design-system clean.
- Radix `Select.Item` forbids an empty-string `value` (throws). All consumer `<option>`s pass explicit values, so this is fine; a value-less option would throw — an acceptable surfaced error, out of scope to special-case.

---

### Task 1: Add the `@radix-ui/react-select` dependency

**Files:**
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Add the dependency**

In `packages/ui/package.json`, add to `"dependencies"` (alphabetical, before `class-variance-authority`):

```json
    "@radix-ui/react-select": "^2.1.6",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: resolves `@radix-ui/react-select` (React 19 compatible; its peer range includes react 19). No peer-dep errors that fail the install.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/package.json pnpm-lock.yaml
git commit -m "build(ui): add @radix-ui/react-select dependency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `Select` on Radix (preserve API)

**Files:**
- Modify: `packages/ui/src/primitives/select.tsx`
- Test: `tests/unit/ui-select-radix.test.mjs`

**Interfaces:**
- Consumes: `@radix-ui/react-select`, `parseSelectOptions` (`select-helpers`).
- Produces: `Select(props: SelectProps)` — same public API, now Radix-backed.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui-select-radix.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Select } from "../../packages/ui/src/index.tsx";

function renderSelect(value) {
  return renderToStaticMarkup(
    React.createElement(
      Select,
      { value, onChange: () => {}, "aria-label": "sensitivity", id: "s1" },
      React.createElement("option", { value: "internal" }, "Internal"),
      React.createElement("option", { value: "confidential" }, "Confidential")
    )
  );
}

test("Select renders a Radix trigger with the design-system trigger classes", () => {
  const html = renderSelect("internal");
  assert.match(html, /<button/);
  assert.match(html, /focus:ring-primary-soft/); // triggerClasses preserved
  assert.match(html, /aria-label="sensitivity"/);
});

test("Select renders without throwing when no value is selected", () => {
  assert.doesNotThrow(() => renderSelect(undefined));
});
```

- [ ] **Step 2: Run — expect FAIL** (`node --import tsx --test tests/unit/ui-select-radix.test.mjs`): the current hand-rolled markup renders, but this asserts the Radix-backed structure — it should pass for `focus:ring-primary-soft` already (that class is on the current trigger too), so make the first assertion Radix-specific instead: also assert the Radix data attribute is present after the rewrite. To get a clean red→green, add this assertion to test 1 and expect it to FAIL now:

```js
  assert.match(html, /data-radix-select-trigger|aria-haspopup="listbox"/) // fails until Radix trigger renders
```

Actually the current trigger uses `aria-haspopup="listbox"`, so instead assert the Radix hidden native select is present (Radix renders a native `<select>` for form submission when `name` is set). Give the test a `name` and assert on it:

Replace `renderSelect` with `{ value, onChange: () => {}, name: "sensitivity", id: "s1", "aria-label": "sensitivity" }` and add:

```js
  assert.match(html, /aria-hidden="true"[^>]*>\s*<select|<select[^>]*aria-hidden="true"/); // Radix's hidden native select
```

Run and expect FAIL (the hand-rolled version has no hidden native `<select>`).

- [ ] **Step 3: Rewrite `select.tsx`**

Replace the entire contents of `packages/ui/src/primitives/select.tsx` with:

```tsx
import * as RadixSelect from "@radix-ui/react-select";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { parseSelectOptions } from "./select-helpers";

// @evcp/ui Select, backed by @radix-ui/react-select for robust accessibility
// (keyboard nav, typeahead, focus, positioning, screen-reader, form submission).
// The public API mirrors the former native <select> so every call site keeps
// compiling: children are <option> elements, and onChange is shaped
// { target: { value } } so handlers reading event.target.value keep working.
export type SelectProps = {
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  children?: ReactNode;
  id?: string;
  name?: string;
  "aria-label"?: string;
};

const triggerClasses =
  "h-10 w-full inline-flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft disabled:opacity-50 disabled:pointer-events-none";

function ChevronDown() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Select({
  value,
  onChange,
  disabled = false,
  required = false,
  className,
  children,
  id,
  name,
  "aria-label": ariaLabel
}: SelectProps) {
  const items = parseSelectOptions(children);
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(next) => onChange?.({ target: { value: next } })}
      disabled={disabled}
      required={required}
      name={name}
    >
      <RadixSelect.Trigger id={id} aria-label={ariaLabel} className={cn(triggerClasses, className)}>
        <RadixSelect.Value placeholder="Select…" />
        <RadixSelect.Icon asChild>
          <ChevronDown />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-border bg-surface py-1 shadow-card"
        >
          <RadixSelect.Viewport>
            {items.map((item, index) => (
              <RadixSelect.Item
                key={`${item.value}-${index}`}
                value={item.value}
                disabled={item.disabled}
                className={cn(
                  "flex cursor-pointer select-none items-center px-3 py-2 text-sm text-body outline-none",
                  "data-[highlighted]:bg-surface-muted data-[state=checked]:text-primary",
                  "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                )}
              >
                <RadixSelect.ItemText>{item.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
```

- [ ] **Step 4: Run the new test + render-smoke**

Run:
```bash
node --import tsx --test tests/unit/ui-select-radix.test.mjs tests/unit/creator-web-render-smoke.test.mjs tests/unit/ui-select-helpers.test.mjs
```
Expected: PASS. **Contingency:** if Radix Select throws under `renderToStaticMarkup` (the render-smoke harness stubs `window`/`document` only partially), the failure will name the missing browser API. If so, extend the stub in `creator-web-render-smoke.test.mjs` (e.g. add `document.createElement`/`getElementById` returns already present) — do NOT gate the primitive on a mount flag unless the stub cannot satisfy it. Re-run until green.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @evcp/ui typecheck && pnpm --filter @evcp/creator-web typecheck && pnpm --filter @evcp/admin-web typecheck`
Expected: clean — `SelectProps` unchanged, so consumers still typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/primitives/select.tsx tests/unit/ui-select-radix.test.mjs
git commit -m "feat(ui): back Select with @radix-ui/react-select (same API + styling)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Full gate + visual verify

- [ ] **Step 1: Full gate**

Run: `pnpm check && pnpm test:e2e && pnpm test:integration`
Expected: all pass (known flaky `idle sweep` / pre-existing excepted). Design-system clean; no consumer file changed.

- [ ] **Step 2: Visual verify (temporary styleguide route)**

Temporarily edit `apps/creator-web/src/main.tsx` to render `KitchenSink` (exported from `@evcp/ui`) when `window.location.pathname.endsWith("/styleguide")`, `docker restart evcp-creator-web`, open `http://localhost:9800/creator/styleguide`, and confirm the Select opens, looks identical to before, options highlight/select correctly, keyboard works, and it layers correctly. **Revert `main.tsx`** and restart before finishing.

- [ ] **Step 3: Commit any fixups** (only if the gate required a change).

---

## Self-Review

**Spec coverage:** dependency added → Task 1; internals on Radix with preserved `SelectProps`/`triggerClasses`/`parseSelectOptions` and removed hand-rolled machinery → Task 2; helpers kept (tested) → Global Constraints; render-smoke/select-helpers/full suites/typecheck/visual → Tasks 2–3.

**Placeholder scan:** Task 2 carries the complete new file + tests; the Step-2 red-state uses Radix's hidden native `<select>` (present only after the rewrite) as the concrete failing assertion. No vague handling.

**Type consistency:** `SelectProps` is byte-identical to the current export; `onValueChange(next)` adapts to `{ target: { value: next } }` matching the `onChange` shape consumers use; `parseSelectOptions` returns `SelectItem[]` ({value,label,disabled}) consumed by the Radix `Item` map.
