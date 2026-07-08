# Horizon Design System

Status: governed MVP baseline
Owner: `@evcp/ui` maintainers
Applies to: `apps/admin-web`, `apps/creator-web`, `apps/app-store-pwa`, and generated app runtime surfaces

## Principles

Horizon UI should feel trustworthy, calm, governed, efficient, and Thai-first. Admin and Creator surfaces are operational tools: keep them dense but readable, status-led, and optimized for repeated work. The Store PWA is end-user facing: keep it simpler, mobile-friendly, and action-focused.

## Ownership Model

`@evcp/ui` is the single UI system entrypoint. Shared components live in `packages/ui/src/index.tsx`; shared CSS, tokens, and surface patterns live in `packages/ui/styles.css`.

Application code must compose existing `@evcp/ui` components before creating new UI. Application code must not own visual tokens, local stylesheets, hardcoded colors, or inline visual styles. When a new pattern is needed, add the class/component to `@evcp/ui`, document its intended use here, and consume it from the app.

Icons use `lucide-react`. Prefer recognizable icon buttons for common tools and include accessible labels or titles when the icon is not self-explanatory.

## Tokens

| Category  | Tokens                                                                             | Usage                                              |
| --------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Brand     | `--evcp-color-primary`, `--evcp-color-primary-strong`, `--evcp-color-primary-soft` | Primary actions, shell highlights, selected states |
| Surface   | `--evcp-color-page`, `--evcp-color-surface`, `--evcp-color-surface-muted`          | Page backgrounds, panels, tables, framed tools     |
| Border    | `--evcp-color-border`, `--evcp-color-border-soft`                                  | Card borders, row dividers, controls               |
| Text      | `--evcp-color-text`, `--evcp-color-muted`                                          | Body copy, headings, secondary labels              |
| Status    | success/warning/danger/info bg/text pairs                                          | Badges, status pills, policy decisions             |
| Code/Diff | `--evcp-color-code-*`, `--evcp-color-diff-*`                                       | Vibe action logs and code diff previews            |
| Spacing   | `--evcp-space-1` through `--evcp-space-7`                                          | Component padding and layout gaps                  |
| Shape     | `--evcp-radius-control`, `--evcp-radius-card`, `--evcp-radius-pill`                | Controls, panels, badges                           |
| Elevation | `--evcp-shadow-card`                                                               | Important panels only                              |

Rules:

- Define raw color values only in `packages/ui/styles.css`.
- Use token names for semantic intent, not visual appearance.
- Keep cards and controls at `8px` radius unless a component has a documented format reason.
- Do not scale type with viewport width. Use stable text sizes and responsive layout constraints.

## Components

| Component                  | Use When                                     | Contract                                                                             |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `AppShell`                 | Admin and Creator application chrome         | Owns sidebar, topbar, current user, environment context                              |
| `PageHeader`               | Screen-level title, description, and actions | One per primary screen; use `tone="surface"` for quieter pages                       |
| `SectionCard`              | A bounded operational panel                  | Do not nest cards inside cards; use full-width bands or unframed layouts around them |
| `MetricCard`               | KPI/status summary                           | Always provide a short label, value, and optional detail                             |
| `DataTable`                | Small to medium operational tables           | Use semantic `ToneBadge` only for status-like cells                                  |
| `DefinitionGrid`           | Label/value metadata                         | Use for fingerprints, versions, owners, policy metadata                              |
| `DecisionPanel`            | Validation, policy, or AI decision result    | Tone must match severity                                                             |
| `WorkflowRail`             | Multi-step process context                   | Use when sequence state helps users orient                                           |
| `ServiceStrip`             | Compact readiness/health row                 | Use for service or environment summaries                                             |
| `ToneBadge` / `StatusPill` | Semantic labels                              | Allowed tones: `success`, `warning`, `danger`, `neutral`, `info`                     |
| `AppCard`                  | Storefront app card                          | Owns access/install action copy and health display                                   |

New components must document variants, states, accessibility behavior, and token usage before broad reuse.

## Surface Patterns

Admin surfaces should favor tables, status cards, audit trails, filters, and configuration panels. Creator surfaces should favor guided workflow, review states, workspace panels, preview/code toggles, and publish readiness. Store surfaces should favor search, app cards, access requests, install state, and ticket submission.

Generated app runtime screens must stay visually compatible with Horizon, but should use constrained runtime patterns rather than full admin/creator chrome.

## Code Rules

Allowed in app code:

- Importing components from `@evcp/ui`.
- Importing `@evcp/ui/styles.css`.
- Applying documented class names from `packages/ui/styles.css`.
- Passing semantic props such as `tone`, `status`, `icon`, `actions`, and `columns`.

Not allowed in app code:

- `style={{ ... }}` for visual presentation.
- Hardcoded colors such as `#1553a6`, `rgb(...)`, `rgba(...)`, `hsl(...)`, or `hsla(...)`.
- Local app stylesheets under `apps/*/src`.
- New visual variants that bypass `@evcp/ui`.

If runtime sizing is unavoidable, prefer native elements such as `progress` or add a documented component API in `@evcp/ui`.

## Enforcement

Run:

```bash
pnpm check:design-system
```

The full quality gate runs this automatically:

```bash
pnpm check
```

Changed-file checks also run design-system governance when app source files change:

```bash
pnpm check:changed --base origin/main
pnpm check:staged
```

The governance check scans `apps/*/src` and fails on app-local stylesheets, inline visual styles, hardcoded colors, and local CSS imports outside `@evcp/ui/styles.css`.

## Change Process

1. Try the existing `@evcp/ui` component first.
2. If a pattern is missing, add or extend it in `packages/ui`.
3. Document the component contract or pattern in this file.
4. Run `pnpm check:design-system` and relevant type/test checks.
5. Include screenshots for user-facing surface changes when behavior or layout changes materially.
