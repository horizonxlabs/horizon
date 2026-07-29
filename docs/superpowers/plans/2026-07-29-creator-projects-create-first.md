# Creator Projects Create-First — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the creator projects landing create-first: replace the PRD-skipping prompt box with a "สร้าง Project ใหม่" CTA that opens the existing Create Project Wizard (which generates a PRD).

**Architecture:** Pure UI rework of one file (`ProjectsPage.tsx`). The wizard, PRD draft generation, and confirm-baseline flow already exist and are unchanged; the only missing link was a trigger for `setIsCreateProjectDialogOpen(true)`, which this adds. The prompt-first `handleCreateFromPrompt` wiring is removed from the page (the hook function stays).

**Tech Stack:** React + Vite (creator-web), `@evcp/ui` `hz-*` design-system classes, lucide-react icons. Test: Node built-in runner via `node --import tsx --test`.

## Global Constraints

- No app-local stylesheets/inline styles/hardcoded colors — reuse existing `@evcp/ui` `hz-*` classes only (enforced by `pnpm check:design-system`). The CTA reuses the existing `hz-prompt-cta` primary-button class; no new CSS.
- Do not delete `handleCreateFromPrompt` from `use-creator-app.tsx` (out of scope; only its `ProjectsPage` wiring is removed).
- `pnpm check` must pass (render-smoke green, design-system clean, oxlint no unused imports).

---

### Task 1: Rework ProjectsPage to create-first

**Files:**
- Modify: `apps/creator-web/src/features/projects/ProjectsPage.tsx`
- Test: `tests/unit/creator-web-render-smoke.test.mjs` (append one test)

**Interfaces:**
- Consumes: `app.setIsCreateProjectDialogOpen(open: boolean)` (already returned by `useCreatorApp`) to open the existing wizard; `app.bootstrap.projects`, `app.selectedProject`, `app.handleSelectProject` (unchanged).
- Produces: a create-first `ProjectsPage` — no free-text prompt box; a "สร้าง Project ใหม่" CTA button opening the wizard.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/creator-web-render-smoke.test.mjs` (uses the existing `renderWithHook` helper and imported `ProjectsPage`):

```js
test("ProjectsPage is create-first: shows the create CTA and no free-text prompt box", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));
  assert.match(html, /สร้าง Project ใหม่/);
  assert.doesNotMatch(html, /อธิบายแอปที่ต้องการสร้าง/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`
Expected: FAIL — the current page renders the prompt textarea (`aria-label="อธิบายแอปที่ต้องการสร้าง"`) and has no "สร้าง Project ใหม่" CTA.

- [ ] **Step 3: Replace ProjectsPage.tsx with the create-first version**

Replace the entire contents of `apps/creator-web/src/features/projects/ProjectsPage.tsx` with:

```tsx
import { Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { CreatorShell } from "./CreatorShell";
import type { useCreatorApp } from "@/app/use-creator-app";
import type { CreatorProjectView } from "@/shared/types";
import type { CreatorPage } from "@/app/routes";

// Deterministic tone per project until stored preview thumbnails are available.
function projectToneClass(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `hz-thumb-tone-${hash % 6}`;
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ProjectsPage({ app }: { app: ReturnType<typeof useCreatorApp> }) {
  const { bootstrap, selectedProject, handleSelectProject, setIsCreateProjectDialogOpen } = app;
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();
  const projects = bootstrap.projects.filter((project: CreatorProjectView) =>
    normalized === ""
      ? true
      : `${project.name} ${project.appType} ${project.owner}`.toLowerCase().includes(normalized)
  );

  return (
    <CreatorShell
      app={app}
      content={
        <div className="hz-home hz-projects-studio">
          <section className="hz-hero">
            <span className="hz-hero-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              Horizon AI Builder
            </span>
            <h1 className="hz-hero-title">เริ่มสร้างแอปภายในองค์กร</h1>
            <p className="hz-hero-sub">
              สร้าง project ใหม่ — ระบุรายละเอียดแอป แล้วระบบจะสร้าง PRD draft ให้ก่อน เพื่อยืนยัน spec ก่อนเริ่มพัฒนา
            </p>
            <button
              type="button"
              className="hz-prompt-cta"
              onClick={() => setIsCreateProjectDialogOpen(true)}
            >
              <Plus size={16} aria-hidden="true" />
              <span>สร้าง Project ใหม่</span>
            </button>
          </section>

          <section className="hz-projects" aria-label="รายการโปรเจกต์">
            <div className="hz-projects-head">
              <h2>
                โปรเจกต์ล่าสุด <span className="hz-count">{projects.length}</span>
              </h2>
              <div className="hz-projects-tools">
                <div className="hz-search">
                  <Search size={16} aria-hidden="true" />
                  <input
                    placeholder="ค้นหาโปรเจกต์…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="ค้นหาโปรเจกต์"
                  />
                </div>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="hz-empty">
                {normalized
                  ? `ไม่พบโปรเจกต์ที่ตรงกับ “${query.trim()}” ลองใช้คำค้นอื่น`
                  : "ยังไม่มีโปรเจกต์ กด “สร้าง Project ใหม่” ด้านบนเพื่อเริ่ม"}
              </div>
            ) : (
              <div className="hz-grid" aria-label="รายการโปรเจกต์">
                {projects.map((project) => {
                  const isActive = project.id === selectedProject.id;
                  return (
                    <button
                      type="button"
                      key={project.id}
                      className={`hz-card ${isActive ? "active" : ""}`.trim()}
                      onClick={() => void handleSelectProject(project, "workspace" as CreatorPage)}
                      aria-current={isActive ? "true" : undefined}
                    >
                      <div className={`hz-thumb ${projectToneClass(project.id)}`}>
                        <span className="hz-project-status">{project.status}</span>
                        <span className="hz-thumb-glyph">{initials(project.name)}</span>
                      </div>
                      <div className="hz-card-meta">
                        <span className="hz-avatar">{initials(project.owner)}</span>
                        <div>
                          <strong>{project.name}</strong>
                          <span>
                            {project.appType} · {project.owner}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      }
    />
  );
}
```

Key changes from the original: dropped `ArrowRight`/`WandSparkles` imports and added `Plus`; removed `PROMPT_SUGGESTIONS`, the `prompt`/`setPrompt` state, `startFromPrompt`, the `hz-prompt` form and `hz-chips`; changed the destructure from `handleCreateFromPrompt` to `setIsCreateProjectDialogOpen`; added the CTA; updated the empty-state copy.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/unit/creator-web-render-smoke.test.mjs`
Expected: PASS (the new test plus the existing render-smoke tests).

- [ ] **Step 5: Typecheck + lint the app**

Run: `pnpm --filter @evcp/creator-web typecheck && pnpm --filter @evcp/creator-web lint 2>/dev/null || pnpm lint:code`
Expected: clean — no unused imports (`ArrowRight`, `WandSparkles`, `handleCreateFromPrompt` are gone from the file), types resolve (`setIsCreateProjectDialogOpen` is on the hook).

- [ ] **Step 6: Commit**

```bash
git add apps/creator-web/src/features/projects/ProjectsPage.tsx tests/unit/creator-web-render-smoke.test.mjs
git commit -m "feat: create-first projects landing — open the PRD-generating wizard instead of the prompt box

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Run the quality gate**

Run: `pnpm check`
Expected: repo hygiene, design-system (no app-local styles — CTA reuses `hz-prompt-cta`), oxlint (no unused imports), typecheck, and unit tests all pass. (Two pre-existing/flaky tests are known — `POST /setup/initialize …` and `idle sweep …`; confirm no *new* failures.)

- [ ] **Step 2: Commit any gate fixups** (only if the gate required a change)

```bash
git add -A
git commit -m "chore: satisfy quality gate for create-first projects landing"
```

---

## Self-Review

**Spec coverage:**
- "no free-text prompt box; create via the option/form wizard" → Task 1 (removes `hz-prompt`/chips, adds CTA opening the wizard).
- "CTA calls `setIsCreateProjectDialogOpen(true)`" → Task 1 Step 3.
- "keep projects list + search" → Task 1 (the `hz-projects` section is retained unchanged apart from empty-state copy).
- "no app-local styles; reuse `hz-*`" → Task 1 uses only existing classes (`hz-prompt-cta`, etc.); Global Constraints + Task 2 design-system check.
- "`handleCreateFromPrompt` not deleted from the hook" → Global Constraints; Task 1 only changes the page's destructure.
- Testing (render-smoke: CTA present, prompt box gone) → Task 1 Steps 1–4.

**Placeholder scan:** none — the full file replacement and the test are concrete.

**Type consistency:** `setIsCreateProjectDialogOpen` is destructured from `app` (the `useCreatorApp` return, which defines it) and called as `setIsCreateProjectDialogOpen(true)`. `CreatorProjectView`, `CreatorPage`, `handleSelectProject`, `bootstrap.projects` are unchanged from the original working page.
