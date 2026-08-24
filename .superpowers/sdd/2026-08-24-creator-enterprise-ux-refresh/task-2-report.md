# Task 2 — Creator Shell, Navigation, and English Page Copy

## Implementation summary

- Kept the reviewed semantic shell hooks (`.app-shell-brand` and `.app-shell-sidebar-toggle`) intact, increased Creator navigation text to 14px, and made the collapsed sidebar control 44px square.
- Normalized `creatorPageCopy` to concise English for every Creator route, including the new project and settings destinations.
- Changed the blocking workspace provisioning message to the approved English copy and omit a `PageHeader` eyebrow when it duplicates the title.
- Kept the first configured Creator destination as the Project dashboard, removed Projects from the constructed sidebar, and retained the intentional PRD Review and Creator Workspace exclusions.
- Replaced the Creator lifecycle menu source-grep assertion with a behavior-level navigation construction test.

## Files changed

- `packages/ui/src/app-shell.tsx`
- `apps/creator-web/src/features/projects/CreatorShell.tsx`
- `apps/creator-web/src/app/routes.ts`
- `packages/config/src/index.ts`
- `tests/unit/creator-enterprise-ux.test.mjs`
- `tests/unit/creator-web-routing.test.mjs`
- `tests/unit/navigation-config.test.mjs`
- `tests/unit/creator-projects-design-contract.test.mjs`

The existing semantic hook CSS in `packages/ui/styles.css` was reviewed and preserved without churn.

## RED evidence

Command:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-enterprise-ux.test.mjs
```

Result: 5 passed, 2 failed as intended.

- The collapsed shell control rendered `h-[30px]` and `w-10`, not the required 44px square control.
- The project page description was Thai rather than `Review project status, key information, and common actions.`

The full-suite follow-up also exposed a stale mobile-drawer contract helper. It selected the first unrelated `@media (max-width: 760px)` block instead of the block containing `.sidebar`, producing an undefined declaration block. Focused RED command:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-projects-design-contract.test.mjs
```

Result: 5 passed, 1 failed at `shared shell has a concrete mobile off-canvas drawer contract`.

## GREEN evidence

Command:

```bash
TSX_TSCONFIG_PATH=$PWD/tsconfig.test.json node --import tsx --test tests/unit/creator-enterprise-ux.test.mjs tests/unit/creator-web-routing.test.mjs tests/unit/navigation-config.test.mjs
```

Result: 35 passed, 0 failed (including the repaired mobile-drawer contract).

The tests cover rendered 14px navigation and collapsed control size, English route copy, English provisioning feedback, non-duplicated page eyebrows, route construction, and the actual selected-project sidebar lifecycle.

## Verification commands and results

```bash
pnpm --filter @evcp/creator-web typecheck
```

Passed (exit 0).

```bash
pnpm --filter @evcp/creator-web build
```

Passed (exit 0). Vite emitted the existing unresolved-at-build-time LINE Seed font warnings only.

```bash
git diff --check
```

Passed (no whitespace errors).

```bash
pnpm test:unit
```

Completed with 1,100 passed, 1 failed, 1 skipped (1,102 total). The only failure is the known assigned stale assertion in `creator-workspace-vibe-cursor.test.mjs`.

## Self-review

- The semantic class hooks previously reviewed in Task 1 are preserved and no CSS uses ARIA-label selectors.
- The navigation lifecycle test observes exported configuration and `createCreatorNavigation` output rather than source text.
- The mobile-drawer contract now identifies the CSS media block containing the sidebar, so it cannot accidentally assert against a preceding unrelated breakpoint.
- Workspace provisioning remains a blocking status overlay; only visible copy changed.
- The page header still shows contextual eyebrows, except when the eyebrow repeats its title.
- No API, business, or non-approved routing behavior was changed.

## Concerns

- The full unit suite retains only the cursor assertion explicitly assigned to Task 8.
