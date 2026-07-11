# Creator Projects B1 Redesign

## Goal

Redesign `/creator/projects` as a professional AI creation studio with the existing Creator `AppShell` light sidebar as the primary navigation.

## Selected Direction

The approved direction is **B1 — AI Creation Studio with Light Sidebar**. The page should feel focused, calm, and enterprise-ready: the prompt composer is the primary action, recent projects are easy to scan, and navigation remains clearly visible without competing with the creation flow.

## Scope

- Redesign the Projects page content and its shared design-system styles.
- Preserve the existing Creator `AppShell`, navigation destinations, project selection, prompt-based project creation, filtering, loading overlay, and project data contracts.
- Add no new backend endpoints and make no changes to project persistence.
- Use Thai for user-facing page copy while retaining established product terms such as Horizon and AI.

## Layout

### Navigation

- Continue rendering `ProjectsPage` inside `CreatorShell`, which already supplies the shared `AppShell` sidebar.
- Use the existing light sidebar on desktop with a clear active Projects item.
- Preserve the shared `AppShell` responsive behavior: compact navigation on tablet and drawer navigation on mobile.
- Do not create a second page-local sidebar.

### AI Creation Hero

- Use a left-aligned content hierarchy rather than the current centered card treatment.
- Show a concise headline, supporting copy, and a prominent prompt composer.
- Keep the prompt textarea, suggestion chips, Enter/submit behavior, and `handleCreateFromPrompt` flow unchanged.
- The composer uses a restrained elevated surface, strong focus state, attachment-context affordance only if supported by the existing flow, and a primary `สร้างด้วย AI` action.
- Suggestions remain optional shortcuts below the composer and must not overpower the primary action.

### Recent Projects

- Present a section header with project count, search field, and compact supporting action.
- Cards show preview tone, project name, application type, owner, status, and recency when the data model provides it.
- Because the current view model does not expose a reliable `updatedAt`, the first implementation must not fabricate timestamps. It will omit recency until the API contract supplies it.
- Status is rendered as a semantic badge, not plain text over the thumbnail.
- Each entire card remains keyboard-operable and opens the existing workspace flow.
- Empty search and no-project states remain explicit and preserve the prompt as the recovery action.

## Responsive Behavior

- Desktop: shared light sidebar remains expanded; hero and project grid use the available content width.
- Tablet: the shared shell may compact navigation; cards use two columns.
- Mobile: navigation uses the shared drawer behavior; prompt controls stack; cards use one column; no horizontal scrolling.

## Visual System

- All production styling lives in `packages/ui/styles.css` and uses existing EVCP tokens.
- Use white and muted surfaces, subtle borders, restrained shadows, and the existing primary blue for focus and primary actions.
- Avoid decorative gradients that reduce information clarity. Deterministic thumbnail tones may remain as quiet project identifiers.
- Keep one strong page headline, one primary CTA, and consistent 8/12/16/24 spacing rhythm.
- Interactive elements need visible hover, focus-visible, pressed, and disabled states.

## Accessibility

- Maintain semantic headings and form labeling.
- Use Thai accessible labels for search, prompt, suggestions, and project list.
- Preserve a visible focus indicator for prompt controls, chips, search, and project cards.
- Status badges include readable text and cannot rely on color alone.
- Respect reduced-motion preferences for hover and loading effects.

## Files and Responsibilities

- `apps/creator-web/src/pages/ProjectsPage.tsx`: page structure, Thai copy, project metadata presentation, search, and existing actions.
- `packages/ui/styles.css`: B1 hero, prompt composer, project toolbar, card, empty, responsive, and focus styling.
- `tests/unit/creator-web-render-smoke.test.mjs`: retain real-hook render coverage and add focused markup assertions where valuable.
- `docs/design/design-system.md`: document the Projects page composition only if a reusable project-card or prompt-surface pattern is introduced.

## Error and Loading Behavior

- Prompt submission continues using the existing workspace-entry loading overlay.
- Failed project creation continues to surface through the existing creation flow; this redesign does not suppress or replace it.
- Search always operates locally against the current bootstrap project list.
- Empty results keep the query visible and explain how to recover.

## Acceptance Criteria

- The Projects page visibly uses the existing light sidebar at desktop width.
- The AI creation prompt is the clearest primary action without hiding recent projects below the initial viewport at common laptop sizes.
- Project cards expose name, app type, owner, and textual status with clear hierarchy.
- Prompt creation, suggestion selection, search, and project opening retain their existing behavior.
- The page is usable at desktop, tablet, and mobile widths without overflow.
- All new visual styling remains in the shared design system and passes the repository design-system check.
- Thai user-facing copy and accessible labels are consistent.
- Typecheck, creator render smoke tests, and relevant repository checks pass.
