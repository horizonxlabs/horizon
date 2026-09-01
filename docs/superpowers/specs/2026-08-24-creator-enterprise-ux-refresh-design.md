# Creator Portal Enterprise UX Refresh

## Summary

Refresh every Creator Portal screen into one coherent enterprise product experience while preserving existing routes, API contracts, permissions, project selection, publishing, deployment, and deletion behavior. The interface will use English for all user-facing copy and retain technical product terms where they are the clearest labels.

The work is a system-first visual and interaction redesign. Shared design tokens, reusable states, button semantics, and responsive data patterns will be established before individual pages are revised. This avoids page-specific styling drift and makes future Creator features cheaper to build consistently.

## Goals

- Make the Creator Portal feel like a mature business product rather than a collection of engineering tools.
- Create clear, consistent hierarchy across navigation, page headers, cards, tables, actions, and system feedback.
- Reduce raw technical information shown by default without hiding useful diagnostic detail.
- Make all Creator screens usable on desktop, tablet, and narrow mobile viewports.
- Use English consistently across page copy, actions, field labels, messages, and status text.
- Improve accessibility through semantic action colors, keyboard focus, readable typography, responsive targets, and explicit system states.
- Consolidate reusable UI behavior into shared components and semantic CSS tokens.

## Non-goals

- Changing backend business rules, API shapes, authentication, permissions, or deployment behavior.
- Replacing the current React application architecture or routing library.
- Rebuilding the shared UI package for unrelated Admin or Store applications.
- Adding new project analytics, audit-log APIs, or thumbnail-generation services.
- Redesigning authentication and first-time setup screens unless shared token changes require minor visual alignment.

## Users and Context

The primary user is an internal product owner, operations lead, or technical administrator who creates and manages enterprise applications. They work primarily on desktop displays but may review access requests, project status, and deployment information on smaller screens. The visual tone is crisp, professional, calm, and data-efficient. The interface must support sustained use without overwhelming users with implementation details.

## Design Principles

1. **Outcome before implementation detail.** Show what happened, what it means, and what the user can do next. Put raw IDs, stack details, and tool output behind secondary disclosure where practical.
2. **One visual language.** Navigation, cards, system states, tables, badges, and actions use shared semantics instead of page-specific conventions.
3. **Primary means primary.** Blue is reserved for the current location and the most important positive action. Destructive actions are red; neutral actions are outlined or subtle.
4. **Progressive density.** Desktop layouts remain efficient while narrow layouts retain every action and provide explicit overflow behavior.
5. **Recoverable states.** Loading, empty, unavailable, and error states explain the situation and expose a relevant next action.
6. **English everywhere.** User-facing copy is consistently English. Raw API values are mapped to readable labels when they appear in the interface.

## Visual System

### Color

Keep the existing blue brand direction and slate neutral foundation. Consolidate usage into semantic tokens:

- `--color-action-primary`: primary buttons and active navigation only.
- `--color-action-danger`: delete, reject, and destructive confirmation.
- `--color-status-success`: active, ready, approved, and completed.
- `--color-status-warning`: pending, draft, and blocked readiness.
- `--color-status-danger`: failed, rejected, destructive, and service error.
- `--color-status-info`: neutral informational state.
- Surface, border, body text, muted text, focus ring, and hover tokens shared by all Creator screens.

Decorative project thumbnails will use restrained neutral or brand-tinted surfaces rather than saturated random gradients. Status colors will communicate state and will not be used as decoration.

### Typography

Continue using LINE Seed Sans TH because it renders both Latin and Thai reliably, but the refreshed Creator UI uses English copy.

- Page title: 24–28px, strong weight, compact line height.
- Section title: 16–18px, semibold.
- Body and table content: 14–16px depending on density.
- Navigation and controls: 14px.
- Supporting text and captions: 12–13px with sufficient contrast.
- Metric values: approximately 24px; avoid oversized dashboard-number styling.

Repeated uppercase eyebrow labels are removed unless they add genuinely new context. A page should not repeat the same concept in its page header, card eyebrow, and card title.

### Spacing and Shape

- Use a consistent 4px-based spacing scale with common page gaps of 16, 20, and 24px.
- Cards use 12–16px radii and either a subtle border or a compact shadow, not both as decoration.
- Interactive targets are at least 44px high on touch layouts.
- Content uses the full available main column where the data benefits from width.

## Shared UI Architecture

### Semantic Creator Components

Add or extend shared components without changing existing data APIs:

- `CreatorPageSection`: consistent section heading, description, action alignment, and spacing.
- `CreatorState`: shared loading, empty, error, and unavailable presentation with optional retry or destination action.
- `CreatorStatusMessage`: compact non-blocking page feedback that maps severity to accessible roles and tones.
- Responsive `DataTable` behavior: explicit horizontal overflow container, sticky header when useful, focusable scroll region, narrow-screen cue, and action cells that remain reachable.
- Semantic action variants: primary, secondary, ghost, danger, and danger-outline.
- Optional technical-detail disclosure for raw service messages, IDs, and diagnostic output.

Components should live in the narrowest shared layer that serves the Creator application. Generic primitives remain in `@evcp/ui`; Creator-specific compositions belong under `apps/creator-web/src/shared`.

### CSS Structure

- Introduce semantic Creator layout and state classes.
- Replace sprint-numbered classes such as `sprint6-shell` on every refreshed Creator surface.
- Replace selectors tied to translated ARIA labels, such as collapse-button text, with stable semantic classes or component props.
- Keep global CSS changes scoped so Admin and Store surfaces are not unintentionally restyled.
- Preserve existing responsive breakpoints unless a component requires an explicit narrow-layout rule.

## Application Shell and Navigation

- Keep the existing sidebar information architecture and project switcher behavior.
- Center the compact logo and label group, retain the smaller mark, and give the collapse control its own stable class.
- Keep navigation labels concise and consistently English.
- Use a single active treatment with sufficient contrast and no unnecessary gradient.
- Ensure collapsed navigation retains tooltips or accessible names.
- Project selection defaults to the most recently created project as already implemented.
- Mobile navigation must expose all destinations and session controls without clipped labels.

## Page Designs

### Projects

- Replace saturated generated thumbnail gradients with restrained project identity surfaces.
- Each project item shows name, application type, owner, readable status, and last-updated or created date when available.
- The currently selected project is indicated without making the card look disabled.
- Search results and the no-project state use the shared state component and a relevant create action.
- The hero is reduced in height and copy density so recent projects remain visible above the fold.

### Project Dashboard

- Use the project name as the sole page title and remove repeated “Project overview” labels.
- Present lifecycle status, PRD version, and frontend version as a compact summary rather than three generic hero metrics.
- Use a full-width two-column layout: project information at roughly two thirds and quick actions at one third, collapsing to one column on narrow screens.
- Convert raw status strings into readable labels.
- Keep Project ID available but visually secondary, with a copy action if the existing primitives support it safely.
- Quick actions remain Workspace, Database, and Publish, with one primary destination and two secondary destinations.

### Database

- Make the database work area full width.
- Add clear loading, no-tables, no-rows, read-error, and write-error states.
- Keep the table list usable on tablet and mobile through a stacked or horizontally scrollable layout.
- Use sticky data-grid headers and readable local date/time formatting.
- Never render raw CSS utility strings or unformatted internal objects as cell content; use semantic value renderers.
- Preserve all existing schema and data operations.

### Versions

- Show one consolidated unavailable/error state instead of a status sentence plus a second warning panel.
- Format checkpoint dates for the user locale and present changed areas as readable tags or concise text.
- Clearly distinguish the current version from restorable versions.
- Keep Restore secondary and require no new confirmation unless the current behavior is destructive.
- Provide Retry through the shared error state.

### Users & Roles

- Use the full main-content width.
- Replace the dominant raw publish/access message with a compact status notice.
- Translate all invitation, member, request, and role labels into English consistently.
- Use primary or success styling for Approve and danger-outline styling for Reject.
- Ensure both actions remain visible and reachable on narrow screens.
- Format permissions as readable labels or chips rather than raw internal strings.
- Give every empty table a contextual empty state.
- Keep the invitation drawer and permission behavior unchanged.

### Publish & Registry

- Replace the flat checklist presentation with a clear readiness sequence: Manifest, Route, Permissions, Preview, and Registry.
- The Publish action is primary only when available. When disabled, show the blocking reasons next to readiness rather than relying only on disabled styling.
- Consolidate duplicate messages into one actionable unavailable or blocked state.
- Replace copy such as “No returned” and “API required” with user-centered explanations.
- Preserve the existing publish API and result data.

### Deployments

- Use one empty state for the absence of deployments instead of repeated empty cards.
- Provide a clear destination action to Publish when no deployment exists.
- When deployments exist, prioritize environment, status, version, deployed time, and relevant action.
- Use readable status labels and consistent date formatting.

### Tickets & Changes

- Distinguish an empty inbox from a service-unavailable state.
- Do not expose the raw word `error` as the primary user message.
- Provide Retry for service failures and a contextual empty message when the inbox is healthy.
- Keep ticket detail and PRD-change actions unchanged, while applying the same state and action semantics.

### Project Settings

- Keep the page visually restrained and focused.
- Separate general project information from the danger zone.
- The danger zone uses red semantics, explains permanent consequences, and requires the exact current project name before deletion.
- Confirmation copy and validation must always reference the selected project consistently.
- Preserve the existing deletion authorization and cleanup flow.

### Creator Workspace

The Workspace is the highest-priority surface because it currently exposes too much tool-level output.

- Keep the chat/preview split but emphasize the current outcome, active progress, preview, and next action.
- Collapse completed technical actions, diffs, commands, and long reasoning by default. Users may expand details when troubleshooting.
- Group streaming progress into structured stages rather than an uninterrupted technical transcript.
- Keep the current request and active agent response visually prominent; compress older completed turns.
- Make quick-message chips wrap or scroll with an explicit affordance so none are clipped.
- Use clear English state labels such as Working, Waiting for input, Completed, Stopped, and Failed.
- Preserve access to code, database, preview refresh, restore points, and diagnostic detail.
- On narrow screens, provide a deliberate panel-switching experience so chat, preview, code, and database do not compete for width.
- Respect `prefers-reduced-motion` for progress and transition effects.

## State and Error Model

Every asynchronous screen maps its data to one of these presentation states:

1. `loading`: skeleton or compact progress with a specific label.
2. `ready-with-data`: normal content.
3. `ready-empty`: contextual explanation and the best available next action.
4. `unavailable`: service or dependency cannot currently provide the feature; offer Retry or a safe destination.
5. `error`: an attempted action failed; preserve existing data, explain impact, and offer recovery.

Raw backend error messages may be included under expandable technical details, but the leading message must be user-centered. Status announcements use `role="status"`; urgent failures use `role="alert"` without duplicating the same message in multiple panels.

## Responsive Behavior

- Desktop: fixed Creator sidebar and full-width main canvas; data-dense layouts may use two columns.
- Tablet: narrower sidebar or collapsed navigation; two-column sections collapse when their minimum content width is reached.
- Mobile: single-column page flow, 44px controls, reachable table actions, and explicit panel switching in Workspace.
- Tables retain semantic table markup and use a focusable overflow container when a card layout would obscure comparison.
- Long IDs, email addresses, status text, and button groups must wrap or truncate with accessible full text.

## Accessibility

- Maintain WCAG 2.1 AA contrast for text, controls, status badges, and focus indicators.
- Do not rely on color alone for active, pending, approved, rejected, or failed states.
- Preserve logical heading order after removing repeated eyebrows.
- All icon-only controls require accessible names.
- Keyboard users can reach navigation, project switching, table actions, expandable details, and Workspace panels.
- Loading changes and action results announce once through appropriate live regions.
- Destructive confirmation retains explicit project-name validation.

## Data Flow and Compatibility

Pages continue receiving the existing `useCreatorApp` return value. The refresh changes presentation and local formatting only. Shared components accept already-derived state, labels, actions, and optional technical details; they do not fetch data themselves. Existing hooks remain responsible for API calls, caching, and mutations.

If a page currently exposes only a raw message string, a small adapter near that feature may map it to a semantic state. No API response shape needs to change for this redesign.

## Testing and Verification

- Add or update unit tests for English copy, semantic action variants, page routing, and shared state rendering.
- Add regression coverage for responsive table wrappers and reachable access-request actions.
- Preserve deletion, project selection, publishing, deployment, ticket, version, and Workspace behavior tests.
- Run Creator-focused unit tests after each page group.
- Run TypeScript typecheck and the Creator production build.
- Run the repository changed-file quality gate and full test suite before completion.
- Review all Creator routes in the authenticated in-app browser at desktop and narrow widths.
- Verify keyboard focus order, visible focus, overflow behavior, reduced motion, and representative contrast pairs.
- Treat existing unrelated test failures separately and do not represent the branch as fully verified while any required suite is failing.

## Implementation Sequence

1. Establish Creator-specific tokens, semantic actions, shared state components, and responsive table behavior.
2. Stabilize shell selectors and navigation presentation.
3. Refresh lower-complexity management pages: Project Dashboard, Settings, Versions, Deployments, and Tickets.
4. Refresh data-heavy pages: Database, Users & Roles, and Publish & Registry.
5. Refresh Projects landing and project cards.
6. Simplify Creator Workspace information hierarchy and narrow-screen panel behavior.
7. Complete copy normalization, accessibility review, responsive browser review, and verification.

## Acceptance Criteria

- Every authenticated Creator management route covered by this refresh uses English user-facing copy.
- All pages share the defined typography, color, spacing, action, and state semantics.
- No touched Creator page relies on a sprint-numbered layout class.
- No touched CSS selector depends on the localized text of an ARIA label.
- Project Dashboard, Users & Roles, Database, and Workspace use the available width effectively.
- Loading, empty, unavailable, and error states are visually distinct and actionable.
- Approve, Reject, Publish, Restore, and Delete communicate different risk and priority correctly.
- All existing business operations and routes continue to work.
- Table actions and Workspace navigation remain usable at narrow widths.
- Required unit tests, typecheck, build, changed-file checks, and browser review pass before delivery.
