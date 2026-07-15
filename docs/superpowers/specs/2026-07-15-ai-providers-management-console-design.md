# AI Providers → Management Console — Design

- **Date:** 2026-07-15
- **Branch:** `main-v1` (dallas worktree)
- **Route affected:** `/admin/ai-providers` (and `/admin/guardrails`, as the split target)
- **Status:** Approved design, pending implementation plan

## Problem

The `/admin/ai-providers` page renders `AiGovernancePanel` — a single 154-line component that
stacks six always-open forms (1. Provider → 2. Credential → 3. Route → 4. Quota → 5. Guardrail →
6. Verify) into a ragged two-column grid, with the actual persisted state (providers, masked
credentials, guardrail events) crammed into three bare tables at the very bottom. It reads like a
setup wizard, not a console an admin returns to.

Additional real defects:

- `AdminConsole.tsx` renders the **same** `AiGovernancePanel` for both `/admin/ai-providers` **and**
  `/admin/guardrails` — the Guardrails nav item is an exact duplicate.
- The page uses the generic shared header ("Platform control center"); nothing identifies it as AI
  Providers.
- Scenario **routes** and **quotas** are **write-only** on the API (`POST /ai/routes`, `POST /ai/quotas`
  with no GET), so today's UI can only offer blind "configure" forms — it cannot show the live
  governance state.

The backend is real and wired (`useAiGovernance` → live Platform API); the problem is UI + two
missing read endpoints, not mock data.

## Goals

1. Turn the page into a **state-first management console**: lead with current providers, credentials,
   routing, and quotas; make write actions focused rather than always-open.
2. **Split** guardrails onto the (currently duplicated) `/admin/guardrails` page so each nav item does
   one real job.
3. Keep everything **genuinely functional** against the real Platform API — no mock/demo fallbacks.
4. Stay **design-system compliant**: styling only via `@evcp/ui` primitives + Tailwind tokens; no
   app-local CSS; files under the 400-line cap.

## Non-goals

- No changes to auth, the AppShell, or unrelated admin pages.
- No new provider adapters or governance semantics beyond exposing existing state.
- No guardrail-engine changes — only relocating the existing rule form + events table.

## Decisions (agreed during brainstorming)

1. **Direction:** Management console (state-first), not a polished form stack.
2. **Scope:** Split — AI Providers owns Providers, Credentials, Scenario Routing, Quota, Test. Guardrail
   rules + events move to the Guardrails page.
3. **Write actions:** Right-side **Drawer** (a new reusable `@evcp/ui` primitive), not inline forms.
4. **Routing & Quota:** State-first — add `GET /ai/routes` + `GET /ai/quotas` so the matrix and quota
   panel reflect real live values.

## Design

### 1. Backend (enables state-first)

- `GET /ai/routes` → `AiScenarioRoute[]` (all configured scenario routes).
- `GET /ai/quotas` → `AiQuota[]` (all configured scopes).
- Both are admin-guarded and mirror the existing `GET /ai/providers` handler in `app-factory.ts`,
  including the `aiGovernancePersistence` path and the in-memory fallback path. Data already lives in
  `platform-services.ts` (`routes: AiScenarioRoute[]`, `quotas: AiQuota[]`); expose read methods
  (`listRoutes()`, `listQuotas()`) that return copies of those arrays.
- api-client (`packages/api-client/src/index.ts`): add `listAiScenarioRoutes(): Promise<AiScenarioRouteDto[]>`
  (GET `/ai/routes`) and `listAiQuotas(): Promise<AiQuotaDto[]>` (GET `/ai/quotas`), and register both
  paths in the AI-governance path allowlist.
- `useAiGovernance`: add `routes` and `quotas` to the snapshot; load them in the initial `Promise.all`;
  after `configureRoute` / `configureQuota` succeed, merge the returned record into the snapshot (upsert
  by `scenario` / `scope`).

### 2. `Drawer` primitive (`packages/ui/src/primitives/drawer.tsx`)

Right-side slide-in panel over a dimmed backdrop. Exported from `@evcp/ui`.

- Props: `open: boolean`, `onClose: () => void`, `title: string`, `description?: string`,
  `footer?: ReactNode`, `children: ReactNode`.
- Accessibility: `role="dialog"` + `aria-modal="true"`, labelled by the title; focus trap; `Esc` and
  backdrop click close; focus returns to the trigger on close; body scroll-lock while open.
- Styling: Tailwind utilities + design tokens only, consistent with the existing AppShell mobile-drawer
  pattern. Utility display classes wrapped so they are not defeated by unlayered base rules (see the
  `@layer base` button fix already applied to `styles.css`).

### 3. AI Providers console — layout (top → bottom)

1. **Header** (own, replaces the generic shared one for this route): eyebrow "AI Governance", title
   "AI Providers", description "Govern which models power generation and how each scenario is routed.",
   top-right **+ Add provider**.
2. **Summary strip** — four `MetricCard`s: Providers (count) · Active credentials (count of
   `status === "active"` api-keys) · Scenarios routed (count of scenarios with a live route, X / 6) ·
   Last test (result of the most recent test run **in this session**, or "—" — the test call is not
   persisted server-side). Tone follows availability.
3. **Availability banner** — keep `DecisionPanel` (ready / unavailable) so an API failure never renders
   as fake success.
4. **Providers** — `SectionCard` "Providers" containing a responsive grid of `ProviderCard`:
   - name + adapter `Badge` + status `StatusPill`
   - base URL (muted, truncated)
   - models as chips
   - credential status: masked value(s) when present, or a "No credential — add one" warning
   - routed-scenario chips (derived from `routes[]`) or "Not routed"
   - actions: **Add credential**, **Edit** (both open drawers)
   - empty state when there are no providers.
5. **Scenario routing matrix** — `SectionCard` "Scenario routing": table with one row per scenario
   (`prd_generation`, `requirement_analysis`, `frontend_coding`, `backend_coding`, `review`,
   `documentation`); columns Scenario | Primary (provider · model) | Fallback (provider · model) |
   Configure. Values from live `routes[]`; "Not configured" when absent. Configure → route drawer with
   the scenario preselected.
6. **Usage quotas** — `SectionCard` "Usage quotas": the four scopes (organization / creator / project /
   app) with Daily · Monthly · Hard-stop · Edit. Values from live `quotas[]`; "No limit set" when
   absent. Edit → quota drawer.
7. **Live governed test** — `SectionCard`: scenario select + prompt → **Run** → result badges
   (status · provider · model · tokens · latency). Real `testProvider` call; never returns the
   credential.
8. **Credentials** — masked-value `DataTable` (credential, provider, masked value, status). Replaces the
   redundant raw provider table (providers are now the cards).

### 4. Guardrails console (the split target)

New `GuardrailsConsole` rendered for `/admin/guardrails`:

- Own header ("Guardrails").
- `SectionCard` "Blocking rules" with **+ Add rule** drawer (name, blocked keyword, severity, action).
- `SectionCard` "Recent guardrail events" — `DataTable` of `guardrailEvents` (event, decision, scenario,
  time).

Uses the existing `createGuardrailRule` and `guardrailEvents` already on the hook. `AdminConsole.tsx`
routing updated so `/ai-providers` → `AiProvidersConsole` and `/guardrails` → `GuardrailsConsole`, each
rendering its own header (the shared generic `PageHeader` is suppressed for these two routes).

### 5. Drawers (same fields as today, relocated + polished with `Input` / `Select` / `Field`)

- **Add / Edit provider:** name, adapter, base URL, models (comma-separated).
- **Add credential:** provider (preselected when opened from a card), credential name, secret
  (`type=password`, `autoComplete="new-password"`; plaintext discarded from the form on success).
- **Configure route:** scenario, primary provider + model, optional fallback provider + model.
- **Edit quota:** scope, daily tokens, monthly tokens (hard-stop always on, stated in the drawer).

All submit via existing hook methods. On success: close the drawer, refresh the snapshot, surface the
result message in the `DecisionPanel`.

### 6. File split (respects the 400-line cap)

Replace the monolithic `AiGovernancePanel.tsx` with focused units under
`apps/admin-web/src/features/ai-governance/`:

- `AiProvidersConsole.tsx` — page composition
- `ProviderCard.tsx`
- `RoutingMatrix.tsx`
- `QuotaPanel.tsx`
- `ProviderTestPanel.tsx`
- `drawers/ProviderDrawer.tsx`, `drawers/CredentialDrawer.tsx`, `drawers/RouteDrawer.tsx`,
  `drawers/QuotaDrawer.tsx`
- `lib/derivations.ts` — pure helpers (`routedScenariosByProvider`, `routingMatrixRows`, `quotaRows`,
  summary counts), unit-testable without rendering

Guardrails: `features/guardrails/GuardrailsConsole.tsx` (+ its rule drawer).
Design system: `packages/ui/src/primitives/drawer.tsx` + export from `index.tsx`.

### 7. Testing

- **Unit** (`node --import tsx --test`): the pure derivations in `lib/derivations.ts`; backend
  `GET /ai/routes` and `GET /ai/quotas` return stored values (mirror the existing `GET /ai/providers`
  test).
- **Render-smoke:** extend the admin render harness to render `AiProvidersConsole` and
  `GuardrailsConsole` with a stubbed hook (browser globals stubbed, no effects) to catch render-time
  throws.
- **Manual / Playwright** in the live dallas app: add provider → add credential → configure route →
  set quota → run test, confirming each action persists and the state view reflects it.

## Risks / edge cases

- `configureAiRoute` returns a single route; ensure the snapshot upsert keys on `scenario` so re-saving
  a scenario updates rather than duplicates. Same for quotas keyed on `scope`.
- Persistence path vs in-memory path in `app-factory.ts`: the new GET handlers must read from whichever
  store the matching POST handler writes to, so reads and writes stay consistent.
- Availability: when the API is unavailable, all write controls stay disabled (existing
  `canMutateAiGovernance`) and the console shows the unavailable banner rather than empty "success".
- The `@layer base` button fix in `styles.css` is a prerequisite for the Drawer's `hidden`-based
  visibility toggling to behave; it is already applied.
