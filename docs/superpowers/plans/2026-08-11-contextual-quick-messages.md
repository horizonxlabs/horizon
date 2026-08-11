# Contextual Quick Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static Creator workspace suggestions with three project-aware Quick Messages that submit immediately in the active Plan or Build mode.

**Architecture:** A pure workspace-local context engine converts already-loaded project, PRD, preview, chat, and file state into deterministic `QuickMessage` values. A focused React component renders and submits those values, while `WorkspacePage` only assembles context and connects the existing `handleVibeChat` boundary.

**Tech Stack:** React 19, TypeScript, `@evcp/ui` Button, Lucide icons, shared EVCP CSS tokens, Node test runner with `tsx`, React server rendering, react-test-renderer.

## Global Constraints

- Return exactly three unique suggestions without making an additional AI request.
- Selecting a suggestion submits its full prompt immediately; it must not only populate the composer.
- Submit through the existing `handleVibeChat` path and preserve the active Plan or Build mode.
- Disable all suggestions while an AI turn is running.
- Keep the manual prompt composer unchanged.
- Use English UI copy.
- Desktop suggestions remain compact; narrow screens scroll horizontally instead of wrapping into a tall block.
- Use native buttons, visible focus state, native disabled state, and a non-color marker for the recommended first suggestion.
- Preserve all unrelated dirty-worktree changes. Stage only task-owned files or hunks.

---

### Task 1: Deterministic Quick Message Context Engine

**Files:**

- Create: `apps/creator-web/src/features/workspace/quick-messages.ts`
- Create: `tests/unit/creator-workspace-quick-messages.test.mjs`

**Interfaces:**

- Consumes: `WorkspaceAgentMode`, `CreatorProjectView`, `PrdSectionDto`, and `VibeMessage`.
- Produces: `buildQuickMessages(context: QuickMessageContext): QuickMessage[]`.
- Produces types:

```ts
export type QuickMessageIntent = "continue" | "product" | "quality" | "release";

export type QuickMessage = {
  id: string;
  label: string;
  prompt: string;
  intent: QuickMessageIntent;
};

export type QuickMessageContext = {
  mode: WorkspaceAgentMode;
  project: Pick<CreatorProjectView, "name" | "appType">;
  prdSummary?: string;
  prdSections?: PrdSectionDto[];
  messages: VibeMessage[];
  hasPreview: boolean;
  hasProjectFiles: boolean;
};
```

- [ ] **Step 1: Write failing context-engine tests**

Create literal fixtures that prove observable behavior rather than source text:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { buildQuickMessages } = await import(
  "../../apps/creator-web/src/features/workspace/quick-messages.ts"
);

const base = {
  project: { name: "Sales KPI Dashboard", appType: "Dashboard" },
  prdSummary: "Track sales performance by representative and period.",
  prdSections: [
    {
      key: "requirements",
      title: "Sales performance filters",
      body: "Filter KPI results by sales representative and reporting period.",
      order: 1
    }
  ],
  messages: [],
  hasProjectFiles: false
};

test("Build suggestions use project and PRD context", () => {
  const messages = buildQuickMessages({ ...base, mode: "build", hasPreview: true });

  assert.equal(messages.length, 3);
  assert.equal(new Set(messages.map((message) => message.id)).size, 3);
  assert.match(messages[0].label, /Sales KPI/);
  assert.match(messages[0].prompt, /Sales KPI Dashboard/);
  assert.match(messages[0].prompt, /sales performance/i);
});

test("Plan suggestions stay read-only and plan the first preview", () => {
  const messages = buildQuickMessages({ ...base, mode: "plan", hasPreview: false });

  assert.equal(messages.length, 3);
  assert.match(messages.map((message) => message.label).join(" "), /Plan first preview/);
  assert.ok(messages.every((message) => /review|plan|identify|assess/i.test(message.prompt)));
});

test("a failed workspace action becomes the recommended recovery", () => {
  const messages = buildQuickMessages({
    ...base,
    mode: "build",
    hasPreview: true,
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        text: "The change failed.",
        actions: [{ id: "action-1", type: "edit", label: "app/page.tsx", status: "failed" }]
      }
    ]
  });

  assert.equal(messages[0].id, "repair-last-action");
  assert.match(messages[0].label, /Fix app\/page\.tsx/);
  assert.match(messages[0].prompt, /diagnose and fix/i);
});

test("attached files produce a project-file suggestion", () => {
  const messages = buildQuickMessages({
    ...base,
    mode: "build",
    hasPreview: true,
    hasProjectFiles: true
  });

  assert.ok(messages.some((message) => message.id === "use-project-files"));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --import tsx --test tests/unit/creator-workspace-quick-messages.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `quick-messages.ts`.

- [ ] **Step 3: Implement the pure context engine**

Implement focused helpers and deterministic candidate ordering:

```ts
import type { PrdSectionDto, WorkspaceAgentMode } from "@evcp/api-client";
import type { CreatorProjectView } from "@/shared/types";
import type { VibeMessage } from "./vibe-stream";

export type QuickMessageIntent = "continue" | "product" | "quality" | "release";

export type QuickMessage = {
  id: string;
  label: string;
  prompt: string;
  intent: QuickMessageIntent;
};

export type QuickMessageContext = {
  mode: WorkspaceAgentMode;
  project: Pick<CreatorProjectView, "name" | "appType">;
  prdSummary?: string;
  prdSections?: PrdSectionDto[];
  messages: VibeMessage[];
  hasPreview: boolean;
  hasProjectFiles: boolean;
};

const normalize = (value: string | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
const clip = (value: string, maximum = 30) =>
  value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;

function latestFailedAction(messages: VibeMessage[]) {
  return [...messages]
    .reverse()
    .flatMap((message) => [...message.actions].reverse())
    .find((action) => action.status === "failed");
}

function latestUserRequest(messages: VibeMessage[]) {
  return normalize([...messages].reverse().find((message) => message.role === "user")?.text);
}

function uniqueFirstThree(candidates: QuickMessage[]): QuickMessage[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalize(candidate.prompt).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

export function buildQuickMessages(context: QuickMessageContext): QuickMessage[] {
  const projectName = normalize(context.project.name) || "this project";
  const shortProjectName = clip(projectName);
  const appType = normalize(context.project.appType) || "application";
  const section = context.prdSections?.find((item) => normalize(item.title) || normalize(item.body));
  const productContext =
    normalize(context.prdSummary) ||
    normalize(section?.body) ||
    normalize(section?.title) ||
    latestUserRequest(context.messages) ||
    `${appType} requirements`;
  const failure = latestFailedAction(context.messages);
  const candidates: QuickMessage[] = [];

  if (failure) {
    candidates.push({
      id: "repair-last-action",
      label: `Fix ${clip(normalize(failure.label) || "last failed change", 26)}`,
      prompt: `Diagnose and fix the failed "${normalize(failure.label) || "workspace change"}" action in ${projectName}. Preserve working behavior and verify the preview after the repair.`,
      intent: "continue"
    });
  }

  if (context.mode === "plan") {
    candidates.push(
      {
        id: "review-prd",
        label: `Review ${shortProjectName} against PRD`,
        prompt: `Review ${projectName} against the current PRD without changing files. Identify gaps and use this product context: ${productContext}`,
        intent: "product"
      },
      {
        id: "prioritize-next",
        label: "Prioritize the next improvement",
        prompt: `Identify and prioritize the next highest-impact improvement for ${projectName}. Explain trade-offs and do not change files.`,
        intent: "product"
      },
      context.hasPreview
        ? {
            id: "assess-release-risks",
            label: "Check release risks",
            prompt: `Assess data, permission, usability, and release risks for ${projectName} without changing files.`,
            intent: "release"
          }
        : {
            id: "plan-first-preview",
            label: "Plan first preview",
            prompt: `Plan the smallest useful first preview for ${projectName} without changing files. Base the plan on: ${productContext}`,
            intent: "product"
          }
    );
  } else {
    candidates.push(
      context.hasPreview
        ? {
            id: "next-prd-improvement",
            label: `Improve ${shortProjectName}`,
            prompt: `Implement the next highest-impact PRD improvement for ${projectName}. Use this product context: ${productContext}. Preserve current working behavior and verify the preview.`,
            intent: "product"
          }
        : {
            id: "build-first-preview",
            label: "Build first preview",
            prompt: `Build the smallest useful first preview for ${projectName}, a ${appType}. Use this product context: ${productContext}. Verify it renders successfully.`,
            intent: "product"
          },
      ...(context.hasProjectFiles
        ? [{
            id: "use-project-files",
            label: "Use attached project files",
            prompt: `Use the attached project files to improve ${projectName}. Keep the implementation aligned with the current PRD and verify the preview.`,
            intent: "continue" as const
          }]
        : []),
      {
        id: "polish-edge-states",
        label: "Polish loading & error states",
        prompt: `Improve loading, empty, error, and retry states in ${projectName}. Keep the existing visual direction and verify each state.`,
        intent: "quality"
      },
      {
        id: "mobile-ready",
        label: `Make ${shortProjectName} mobile-ready`,
        prompt: `Make ${projectName} responsive for narrow mobile screens while preserving desktop behavior. Verify keyboard focus and touch targets.`,
        intent: "quality"
      }
    );
  }

  return uniqueFirstThree(candidates);
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --import tsx --test tests/unit/creator-workspace-quick-messages.test.mjs
```

Expected: 4 tests PASS, 0 failures.

- [ ] **Step 5: Commit the engine**

```bash
git add apps/creator-web/src/features/workspace/quick-messages.ts tests/unit/creator-workspace-quick-messages.test.mjs
git commit -m "feat(creator): derive contextual quick messages"
```

---

### Task 2: Immediate-Submit Quick Messages Component

**Files:**

- Create: `apps/creator-web/src/features/workspace/QuickMessages.tsx`
- Create: `tests/unit/creator-workspace-quick-message-ui.test.mjs`
- Modify: `apps/creator-web/src/features/workspace/WorkspacePage.tsx`
- Modify: `tests/unit/creator-web-render-smoke.test.mjs:305-335`

**Interfaces:**

- Consumes: `QuickMessage[]`, `disabled: boolean`, and `onSubmit(prompt: string): void`.
- Produces: `QuickMessages` React component.
- Integrates Task 1's `buildQuickMessages` with the existing `handleVibeChat({ prompt, mode })` boundary.

- [ ] **Step 1: Write failing component behavior tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

globalThis.React = React;

const { QuickMessages } = await import(
  "../../apps/creator-web/src/features/workspace/QuickMessages.tsx"
);

const items = [
  { id: "one", label: "Improve Sales KPI", prompt: "Full contextual prompt one", intent: "product" },
  { id: "two", label: "Polish loading states", prompt: "Full contextual prompt two", intent: "quality" },
  { id: "three", label: "Make it mobile-ready", prompt: "Full contextual prompt three", intent: "quality" }
];

test("selecting a Quick Message submits its full prompt immediately", async () => {
  const submissions = [];
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(QuickMessages, {
        items,
        disabled: false,
        onSubmit: (prompt) => submissions.push(prompt)
      })
    );
  });

  await act(async () => renderer.root.findAllByType("button")[0].props.onClick());
  assert.deepEqual(submissions, ["Full contextual prompt one"]);
});

test("Quick Messages are native disabled buttons during an AI turn", async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(QuickMessages, { items, disabled: true, onSubmit() {} })
    );
  });

  const buttons = renderer.root.findAllByType("button");
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every((button) => button.props.disabled === true));
});

test("the recommended Quick Message is identified without relying on color", async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(QuickMessages, { items, disabled: false, onSubmit() {} })
    );
  });

  const section = renderer.root.findByType("section");
  const firstButton = renderer.root.findAllByType("button")[0];
  assert.equal(section.props["aria-label"], "Suggested next");
  assert.equal(firstButton.props["aria-label"], "Recommended: Improve Sales KPI");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --import tsx --test tests/unit/creator-workspace-quick-message-ui.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `QuickMessages.tsx`.

- [ ] **Step 3: Implement the component**

```tsx
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@evcp/ui";
import type { QuickMessage } from "./quick-messages";

export function QuickMessages({
  items,
  disabled,
  onSubmit
}: {
  items: QuickMessage[];
  disabled: boolean;
  onSubmit: (prompt: string) => void;
}) {
  return (
    <section className="vibe-live-suggestions" aria-label="Suggested next">
      <div className="vibe-live-suggestions-head">
        <Sparkles size={13} aria-hidden="true" />
        <span>Suggested next</span>
      </div>
      <div className="vibe-live-suggestion-track">
        {items.map((item, index) => (
          <Button
            key={item.id}
            variant="secondary"
            size="sm"
            type="button"
            className={`vibe-live-suggestion${index === 0 ? " is-recommended" : ""}`}
            aria-label={index === 0 ? `Recommended: ${item.label}` : item.label}
            title={item.prompt}
            disabled={disabled}
            onClick={() => onSubmit(item.prompt)}
          >
            {index === 0 ? <Sparkles size={13} aria-hidden="true" /> : null}
            <span>{item.label}</span>
            <ArrowRight size={13} aria-hidden="true" />
          </Button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run component tests and verify GREEN**

Run:

```bash
node --import tsx --test tests/unit/creator-workspace-quick-message-ui.test.mjs
```

Expected: 3 tests PASS, 0 failures.

- [ ] **Step 5: Add a failing WorkspacePage integration test**

Extend `tests/unit/creator-web-render-smoke.test.mjs` before modifying `WorkspacePage`:

```js
test("WorkspacePage renders contextual Quick Messages", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, {
      app: {
        ...app,
        selectedProject: {
          ...app.selectedProject,
          id: "project-1",
          name: "Sales KPI Dashboard",
          appType: "Dashboard"
        },
        bootstrap: { ...app.bootstrap, status: "ready" }
      }
    })
  );

  assert.match(html, /aria-label="Suggested next"/);
  assert.match(html, /Recommended: (Build first preview|Improve Sales KPI Dashboard)/);
  assert.equal((html.match(/<button[^>]+vibe-live-suggestion/g) ?? []).length, 3);
});
```

- [ ] **Step 6: Run the WorkspacePage test and verify RED**

Run:

```bash
node --import tsx --test --test-name-pattern="WorkspacePage renders contextual Quick Messages" tests/unit/creator-web-render-smoke.test.mjs
```

Expected: FAIL because `WorkspacePage` still renders the old static suggestions without the `Suggested next` group or recommended marker.

- [ ] **Step 7: Wire contextual messages into WorkspacePage**

Remove the static `SUGGESTIONS` constant and its `setPromptDraft` click behavior. Import `QuickMessages` and `buildQuickMessages`, then build from state already exposed by `useCreatorApp`:

```tsx
const quickMessages = buildQuickMessages({
  mode: workspaceMode,
  project: selectedProject,
  prdSummary: currentPrdVersion?.changeSummary,
  prdSections: currentPrdVersion?.sections,
  messages: vibeMessages,
  hasPreview,
  hasProjectFiles: projectFiles.length > 0
});
```

Render above the project-file area:

```tsx
<QuickMessages
  items={quickMessages}
  disabled={isVibing}
  onSubmit={(prompt) => {
    void handleVibeChat({ prompt, mode: workspaceMode });
  }}
/>
```

Do not pass `projectId` in the override because `useVibeChat` intentionally preserves selected attachment IDs only when it uses the current project closure.

- [ ] **Step 8: Run component and Creator render tests**

Run:

```bash
node --import tsx --test tests/unit/creator-workspace-quick-message-ui.test.mjs tests/unit/creator-web-render-smoke.test.mjs
```

Expected: all tests PASS; react-test-renderer may print its existing deprecation warning but must report 0 failures.

- [ ] **Step 9: Commit interaction behavior**

```bash
git add apps/creator-web/src/features/workspace/QuickMessages.tsx apps/creator-web/src/features/workspace/WorkspacePage.tsx tests/unit/creator-workspace-quick-message-ui.test.mjs tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat(creator): submit contextual quick messages"
```

---

### Task 3: Compact Responsive Styling and Final Verification

**Files:**

- Modify: `packages/ui/styles.css:3160-3180`

**Interfaces:**

- Styles Task 2's `.vibe-live-suggestions`, `.vibe-live-suggestions-head`, `.vibe-live-suggestion-track`, `.vibe-live-suggestion`, and `.is-recommended` classes.
- Task 2 already protects button semantics and integration behavior; this task verifies visual styling through the live browser because CSS appearance is not meaningfully covered by source-text assertions.

- [ ] **Step 1: Implement compact branded styles**

Replace the old suggestion block with:

```css
.vibe-live-suggestions {
  display: grid;
  gap: 7px;
  padding: 0 18px var(--evcp-space-2);
}

.vibe-live-suggestions-head {
  align-items: center;
  color: var(--evcp-color-muted);
  display: flex;
  font-size: 11px;
  font-weight: 750;
  gap: 5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.vibe-live-suggestion-track {
  display: flex;
  gap: 7px;
  min-width: 0;
  overflow-x: auto;
  padding: 1px 1px 4px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}

.vibe-live-suggestion-track::-webkit-scrollbar {
  display: none;
}

.vibe-live-suggestion {
  background: color-mix(in srgb, var(--evcp-color-surface) 94%, #eef2ff);
  border-color: var(--evcp-color-border-soft);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  color: var(--evcp-color-body);
  flex: 0 0 auto;
  font-size: 12px;
  height: 36px;
  max-width: 260px;
  scroll-snap-align: start;
  transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.vibe-live-suggestion span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vibe-live-suggestion:hover:not(:disabled) {
  border-color: var(--evcp-color-primary);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
}

.vibe-live-suggestion.is-recommended {
  background: linear-gradient(110deg, #eff6ff, #f5f3ff);
  border-color: color-mix(in srgb, var(--evcp-color-primary) 46%, white);
  color: var(--evcp-color-primary-strong);
}

@media (max-width: 760px) {
  .vibe-live-suggestions {
    padding-inline: 14px;
  }

  .vibe-live-suggestion {
    max-width: min(78vw, 260px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vibe-live-suggestion {
    transition: none;
  }
}
```

- [ ] **Step 2: Run focused feature checks**

Run:

```bash
node --import tsx --test tests/unit/creator-workspace-quick-messages.test.mjs tests/unit/creator-workspace-quick-message-ui.test.mjs tests/unit/creator-web-render-smoke.test.mjs
pnpm --filter @evcp/creator-web typecheck
pnpm --filter @evcp/creator-web build
pnpm check:changed
git diff --check
```

Expected: all commands exit 0. Vite may print its existing `__dirname` and unresolved development-font warnings; the build must still complete successfully.

- [ ] **Step 3: Visually verify in the running Creator workspace**

Open an existing project with chat history and confirm:

1. The section reads `Suggested next`.
2. Exactly three compact suggestions appear.
3. The first suggestion has the sparkle marker and subtle blue-violet surface.
4. Plan and Build modes produce different contextual labels.
5. Narrow width scrolls horizontally without making the composer jump vertically.
6. During an active AI turn all three buttons are disabled.
7. The manual composer continues to accept custom prompts.

Do not click a live Quick Message during visual-only verification unless the project owner explicitly wants a real AI turn executed; automated tests cover immediate submission.

- [ ] **Step 4: Commit only Quick Message styling**

`packages/ui/styles.css` already contains unrelated logo work. Stage only the Quick Message CSS hunk:

```bash
git add -p packages/ui/styles.css
git commit -m "style(creator): polish contextual quick messages"
```

Before committing, inspect `git diff --cached --stat` and `git diff --cached` to ensure no logo or preview-recovery changes are included.
