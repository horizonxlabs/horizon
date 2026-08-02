# Creator Design-System Unification — Phase 4 (Workspace) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the workspace vibe-coding UI's raw controls to `@evcp/ui` primitives (`Tabs`, `Button`, `Textarea`), keeping the bespoke chat/preview/code/grid layout.

**Architecture:** Four tasks, one per area (4a WorkspacePage header/tabs, 4b WorkspacePage prompt bar, 4c WorkspaceCodePanel, 4d WorkspaceDatabasePanel). Each converts `<button>`→`Button`, the tab bar→`Tabs`, and the prompt `<textarea>`→`Textarea`, preserving every handler/prop. Layout shells, links, chat bubbles, streaming markdown, preview iframe, code tree, and data grid stay bespoke.

**Tech Stack:** React + Vite (creator-web), `@evcp/ui` primitives, lucide-react. Tests: Node built-in runner via `renderToStaticMarkup`.

## Global Constraints

- No app-local stylesheets/inline styles/hardcoded colors — `@evcp/ui` primitives only (`pnpm check:design-system`).
- Preserve every handler, `disabled`, `title`, `aria-*`, and streaming/effect behaviour — only the control element changes.
- `WorkspacePage.tsx` must stay **≤ 400 lines** (it is 388; `Tabs` shrinks the tab block, `Button` conversions are roughly line-neutral).
- Run the **full** unit + e2e + integration suites before pushing (e2e is not in `pnpm check`); the sprint smoke tests read creator source, so watch for stale source-surface assertions.
- Keep as-is: `<a>` links (back, preview), chat thread + `vibe-message*` bubbles, `VibeMarkdown`/`VibeReasoning` content, preview iframe, code tree, react-data-grid.

`@evcp/ui` control APIs: `Tabs<T>({ items: {id,label}[], active: T, onSelect: (id)=>void, "aria-label"? })`; `Button({ variant: "primary"|"secondary"|"ghost"|"danger", size?, ...buttonProps })`; `Textarea(...textareaProps)`.

---

### Task 4a: WorkspacePage header + tabs

**Files:**
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx` (imports + header block)
- Test: `tests/unit/creator-web-render-smoke.test.mjs`

- [ ] **Step 1: Write the failing test** — append:

```js
test("WorkspacePage tabs + header controls use @evcp/ui primitives", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.doesNotMatch(html, /class="vibe-live-tab /);          // tab bar is now the Tabs primitive
  assert.doesNotMatch(html, /class="[^"]*vibe-live-icon-btn/); // refresh is now a Button
  assert.match(html, /Publish<\/button>/);                     // publish still present
});
```

- [ ] **Step 2: Run — expect FAIL** (`node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`) because the raw `vibe-live-tab` / `vibe-live-icon-btn` markup is still present.

- [ ] **Step 3: Edit `WorkspacePage.tsx`**

Add to the `@evcp/ui` import (WorkspacePage currently has none — add a new import line near the top):

```tsx
import { Button, Tabs } from "@evcp/ui";
```

Replace the `vibe-live-tabs` tablist block:

```tsx
          <div className="vibe-live-tabs" role="tablist" aria-label="Workspace view">
            {WORKSPACE_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setVibeTab(tab)}
                className={`vibe-live-tab ${vibeTab === tab ? "is-active" : ""}`.trim()}
                role="tab"
                aria-selected={vibeTab === tab}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
```

with:

```tsx
          <Tabs
            items={WORKSPACE_TABS.map((tab) => ({ id: tab, label: TAB_LABELS[tab] }))}
            active={vibeTab}
            onSelect={setVibeTab}
            aria-label="Workspace view"
          />
```

Replace the refresh button (`vibe-live-icon-btn`):

```tsx
          <Button
            variant="ghost"
            type="button"
            onClick={() => setVibePreviewKey((key) => key + 1)}
            title="Refresh preview"
            aria-label="Refresh preview"
          >
            <RotateCw size={15} />
          </Button>
```

Replace the publish button (`vibe-live-control vibe-live-control-primary`):

```tsx
          <Button
            variant="primary"
            type="button"
            title="Publish to staging or production"
            disabled={workspaceMode === "plan"}
            onClick={() => setShowPublish(true)}
          >
            Publish
          </Button>
```

Leave the back `<a>` and preview `<a>` links, the divider, project name, and status as-is.

- [ ] **Step 4: Run test + typecheck + line count**

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck
wc -l apps/creator-web/src/features/workspace/WorkspacePage.tsx   # must be <= 400
```
Expected: PASS; clean; ≤ 400.

- [ ] **Step 5: Commit**

```bash
git add apps/creator-web/src/features/workspace/WorkspacePage.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: workspace header tabs + controls on @evcp/ui Tabs + Button (4a)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4b: WorkspacePage prompt bar + in-thread buttons

**Files:**
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx` (thread/composer blocks)

Convert every remaining raw `<button>` and the composer `<textarea>` in `WorkspacePage.tsx`, preserving all props/handlers:

- [ ] **Step 1: Convert the controls** — replace, one at a time:
  - the "Approve & implement" button (`className="vibe-live-control vibe-live-control-primary"`, `onClick={() => approveAndImplement(...)}`) → `<Button variant="primary" type="button" onClick={...}>Approve &amp; implement</Button>`.
  - each suggestion button (`className="vibe-live-suggestion"`, `onClick={() => setPromptDraft(suggestion)}`) → `<Button variant="secondary" type="button" key={suggestion} onClick={...}>{suggestion}</Button>`.
  - each project-file chip (`className={\`vibe-live-file-chip ${selected ? "is-selected" : ""}\`}`, `onClick={() => toggleProjectFileAttachment(file.id)}`, `disabled={!ready}`) → `<Button variant={selected ? "primary" : "secondary"} type="button" key={file.id} onClick={...} disabled={!ready} title={...}>…</Button>`.
  - the composer `<textarea className="vibe-live-input" value={promptDraft} onChange=… placeholder=… …>` → `<Textarea value={promptDraft} onChange={…} placeholder={…} …>` (import `Textarea` — add to the `@evcp/ui` import from 4a). Keep the surrounding `vibe-live-composer` layout.
  - each Plan/Build mode option (`className={\`vibe-mode-option ${workspaceMode === value ? "is-active" : ""}\`}`, `onClick={() => setWorkspaceMode(value)}`) → `<Button variant={workspaceMode === value ? "primary" : "secondary"} type="button" key={value} onClick={...}>{label icon/description}</Button>`.
  - the send button (`className="vibe-live-send"`, `onClick={() => void handleVibeChat()}`, `disabled={isVibing || !promptDraft.trim()}`) → `<Button variant="primary" type="button" onClick={...} disabled={...}>…</Button>`.
  - the preview-retry button inside the unauthorized state (`onClick={() => setPreviewAuthorizationAttempt((a) => a + 1)}`) → `<Button variant="secondary" type="button" onClick={...}>…</Button>`.

  Leave the file-attach `<label>` + hidden `<input type="file">`, the composer/footer/mode-switch layout wrappers, the iframe, and all chat/message markup unchanged.

- [ ] **Step 2: Add the render-smoke assertion** — append:

```js
test("WorkspacePage composer uses primitive Textarea + Button (no raw send/input)", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.doesNotMatch(html, /class="vibe-live-send"/);
  assert.doesNotMatch(html, /class="vibe-live-input"/);
});
```

- [ ] **Step 3: Run test + typecheck + line count**

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck
wc -l apps/creator-web/src/features/workspace/WorkspacePage.tsx   # <= 400
```
Expected: PASS; clean; ≤ 400. If over 400, tighten a nearby multi-line control onto fewer lines (no behaviour change) — do not extract.

- [ ] **Step 4: Commit**

```bash
git add apps/creator-web/src/features/workspace/WorkspacePage.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: workspace prompt bar on @evcp/ui Textarea + Button (4b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4c: WorkspaceCodePanel controls

**Files:**
- Modify: `apps/creator-web/src/features/workspace/WorkspaceCodePanel.tsx`

- [ ] **Step 1:** Read the file; import `Button` from `@evcp/ui`; convert each raw `<button>` (the `hz-code-*`/`hz-tree-row` action buttons) to `<Button variant="…">`, preserving every `onClick`/`disabled`/`title`/`key`. Pick `variant="ghost"` for icon/tree-row buttons and `variant="secondary"` for text buttons unless a button is clearly the primary action. Keep the file tree, code viewer, and `hz-code-*` layout wrappers unchanged.

- [ ] **Step 2:** Extend the render-smoke assertion (or rely on the existing `WorkspacePage renders` route case that mounts the Code panel) so the panel renders without throwing:

```js
test("WorkspaceCodePanel renders on primitives without throwing", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, vibeTab: "code", bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.equal(typeof html, "string");
});
```

- [ ] **Step 3: Run + typecheck**

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck
```
Expected: PASS; clean.

- [ ] **Step 4: Commit**

```bash
git add apps/creator-web/src/features/workspace/WorkspaceCodePanel.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: workspace code panel controls on @evcp/ui Button (4c)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4d: WorkspaceDatabasePanel controls + stray chat buttons

**Files:**
- Modify: `apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx`
- Modify: `apps/creator-web/src/features/workspace/VibeActionRow.tsx`, `VibeReasoning.tsx` (only if they contain a raw `<button>`)

- [ ] **Step 1:** Read `WorkspaceDatabasePanel.tsx`; import `Button`; convert each raw `<button>` (the `hz-db-*` controls) to `<Button variant="…">`, preserving handlers; keep the react-data-grid and `hz-db-*` layout. Do the same for any `<button>` in `VibeActionRow.tsx`/`VibeReasoning.tsx` (leave them untouched if none).

- [ ] **Step 2:** Add a render assertion for the database tab:

```js
test("WorkspaceDatabasePanel renders on primitives without throwing", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, vibeTab: "database", bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.equal(typeof html, "string");
});
```

- [ ] **Step 3: Run + typecheck**

```bash
node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck
```
Expected: PASS; clean.

- [ ] **Step 4: Commit**

```bash
git add apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx apps/creator-web/src/features/workspace/VibeActionRow.tsx apps/creator-web/src/features/workspace/VibeReasoning.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: workspace database panel + chat controls on @evcp/ui Button (4d)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4e: Full gate + visual verify

- [ ] **Step 1: All suites**

```bash
pnpm check && pnpm test:e2e && pnpm test:integration
```
Expected: all pass (known pre-existing/flaky excepted); confirm the sprint source-surface e2e tests still pass. `WorkspacePage.tsx` ≤ 400.

- [ ] **Step 2: Visual** — `docker restart evcp-creator-web`, open a project workspace, and confirm the header, tabs, mode toggle, prompt, send, and the Code/Database panel buttons match the design system; the chat, preview, code tree, and data grid are visually unchanged.

- [ ] **Step 3: Commit any fixups** (only if the gate required a change).

---

## Self-Review

**Spec coverage:** 4a header/tabs (Tabs + Button) → Task 4a; 4b prompt bar (Textarea + Button, mode toggle, send, suggestions, approve, file chips, preview-retry) → Task 4b; 4c code panel → Task 4c; 4d database panel + chat buttons → Task 4d; full-suite + visual + ≤400 → Task 4e + per-task line checks. Kept-bespoke UI is called out in Global Constraints and each task.

**Placeholder scan:** 4a/4b carry exact before/after; 4c/4d specify the exact conversion rule (raw `<button>` → `Button` with a named variant, preserving all props) and are enumerated per file — the implementer reads each file's buttons, which are homogeneous. No "TBD"/vague-handling.

**Type consistency:** `Tabs` is called with `items:{id,label}[]`, `active: WorkspaceAgentView (vibeTab)`, `onSelect: setVibeTab` (matching the primitive's `active`/`onSelect`). `Button`/`Textarea` use `@evcp/ui`'s exported props. Every conversion preserves the original `onClick`/`disabled`/etc.
