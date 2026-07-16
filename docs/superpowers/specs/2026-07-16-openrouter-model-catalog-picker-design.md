# OpenRouter Model Catalog Picker — Design

**Date:** 2026-07-16
**Status:** Approved for planning
**Author:** platform (with Claude)
**Builds on:** `2026-07-16-openrouter-lmstudio-provider-adapters-design.md` (OpenRouter/LM Studio adapters, already merged as commits 4222889 + 29d6768).

## Goal

When an admin selects **OpenRouter** in the Add-provider drawer, fetch OpenRouter's
model catalog and let them pick the provider's approved models from a **searchable
multi-select** (chips), instead of typing model ids into a comma-separated field.

## Context / current state

- OpenRouter exposes a public (no-auth) catalog at `GET https://openrouter.ai/api/v1/models`
  → `{ data: [{ id, name, context_length, pricing, ... }] }` (~300+ models). `id` is the
  slug that goes into the provider's `models` array (e.g. `openai/gpt-4.1-mini`).
- The generic OpenAI-compatible models endpoint is `${baseUrl}/models`, so a catalog
  fetch keyed on the provider's base URL naturally extends to LM Studio and any
  OpenAI-compatible provider later (out of scope now).
- The admin app talks to Platform API only (browser → Platform API → external). AI
  routes live in `apps/platform-api/src/ai-governance/ai-governance-routes.ts`, split
  into a persisted async dispatcher (`handleAiGovernanceRoute`) and an in-memory sync
  dispatcher (`handleInMemoryAiGovernanceRoute`), both matching `request.path` exactly.
- `AiProvider.models` is `string[]` — a provider approves a set of models; scenario
  routes later pick one. Multi-select fits this shape.
- The self-contained route pattern to mirror is `provider-test-route.ts` +
  `tests/unit/ai-provider-test-route.test.mjs` (a route handler with injected
  dependencies, unit-tested directly).

## Design

### Decision 1 — Backend fetch (approved)

Platform API is the single egress + governance point; the browser must not call
OpenRouter directly (CORS, and admin-web may have no internet egress in the private
stack). Add a backend endpoint that fetches the catalog server-side.

### Decision 2 — Searchable multi-select with chips (approved)

The drawer renders a search box + filtered model list; picked models show as removable
chips and become the provider's `models` array on submit. Feature-local component (not a
new `@evcp/ui` primitive), styled only with existing design-system token classes.

### Backend

New module `apps/platform-api/src/ai-governance/provider-catalog.ts`:

- `fetchProviderModelCatalog(input: { baseUrl: string; fetcher?: typeof fetch; timeoutMs?: number }): Promise<{ models: Array<{ id: string; name: string; contextLength?: number }> }>`
  — GETs `${baseUrl.replace(/\/$/, "")}/models` (no auth; OpenRouter catalog is public),
  maps `data[]` → `{ id, name: name ?? id, contextLength: context_length }`, sorts by id.
  On non-2xx or transport error, throws a sanitized `ValidationError`. Defaults `fetcher`
  to `globalThis.fetch`, `timeoutMs` to 10_000 (via `AbortSignal.timeout`).
- `handleProviderCatalogRoute(input: { request; user: PlatformUser; fetcher?: typeof fetch }): Promise<PlatformResponse>`
  — requires `user.role === "admin"` (else 403 `failure`); reads `request.body.baseUrl`
  (400 if missing); returns `success(await fetchProviderModelCatalog(...))`.

Wire into the **persisted** dispatcher (`handleAiGovernanceRoute`) only, inside the
existing `if (ctx.aiGovernancePersistence)` block:

```ts
if (request.method === "POST" && request.path === "/ai/provider-catalog") {
  const user = await resolvePersistenceUser(services, request.headers ?? {});
  return handleProviderCatalogRoute({ request, user });
}
```

The endpoint needs no DB, so it is NOT added to the in-memory sync dispatcher; in
memory/test mode it 404s and the UI falls back to the free-text field. The network
logic is unit-tested directly (injected fetcher), not through the dispatcher.

**Method:** POST with a `{ baseUrl }` body (matches the codebase's `provider-test-call`
convention of POST-with-input; avoids query-string parsing). It is a read with an input,
not a mutation.

**SSRF note:** the endpoint is admin-gated and fetches the same base URL the provider
will call at execution time, so it adds no trust surface beyond what an admin already
controls. No new egress target an admin couldn't already configure.

### api-client

- `ai-governance-types.ts`: `ProviderModelCatalogDto = { models: Array<{ id: string; name: string; contextLength?: number }> }`.
- `PlatformApiClient.listProviderModelCatalog(baseUrl: string): Promise<ProviderModelCatalogDto>`
  → `this.request("/ai/provider-catalog", { method: "POST", body: { baseUrl } })`.

### Hook + UI

- `use-ai-governance.ts`: add `loadModelCatalog(baseUrl: string) => client.listProviderModelCatalog(baseUrl)`; expose it.
- New pure helper (unit-tested): `filterModels(models, query)` — case-insensitive substring
  match on `id` + `name`.
- New feature component `drawers/ModelCatalogPicker.tsx`: props `{ loadCatalog, value: string[], onChange }`.
  On mount, calls `loadCatalog(baseUrl)`; shows loading / error / ready. Ready state = search
  `Input` + scrollable filtered list (click to toggle) + selected chips (click to remove).
  On error, renders a message and lets the parent fall back to free-text.
- `ProviderDrawer.tsx`: when `adapter === "openrouter"`, render `ModelCatalogPicker` (bound
  to a `string[]` state) in place of the free-text Models field; on catalog error, show the
  free-text field instead. Other adapters keep the free-text field unchanged. Submit sends
  the selected models (openrouter) or the parsed comma list (others).

## Out of scope

- LM Studio / other adapters' catalogs (the endpoint is generic but only OpenRouter is wired
  in the UI).
- Pricing / context-length display beyond what's needed to identify a model (id + name shown;
  contextLength returned but UI use is minimal).
- Caching the catalog server-side (acceptable to fetch per drawer-open for now).
- Any LiteLLM transport work (separate slice).

## Testing strategy

- Unit `tests/unit/provider-catalog.test.mjs`: `fetchProviderModelCatalog` maps `data[]`
  correctly (id/name/context_length), throws sanitized on non-2xx and on transport error,
  returns empty list for empty `data`; `handleProviderCatalogRoute` returns 403 for a
  non-admin, 400 when `baseUrl` is missing, and `success` with models for an admin (all with
  an injected fetcher).
- Unit `tests/unit/ai-governance-model-filter.test.mjs` (or extend an existing derivations
  test): `filterModels` matches on id and name, case-insensitively, and returns all for an
  empty query.
- `tests/unit/admin-web-render-smoke.test.mjs`: `ModelCatalogPicker` renders its loading
  state without throwing given a `loadCatalog` stub; `ProviderDrawer` still renders.
- api-client contract: extend the AI reads test if one asserts client method presence.

## Risks

- Low-medium. The main integration seam is the POST `/ai/provider-catalog` path string
  matching between api-client and the persisted dispatcher, and the `{ baseUrl }` body shape.
  The network logic is isolated and unit-tested with an injected fetcher.
- Custom `@evcp/ui` `Select` renders options only when open — the picker is a bespoke
  checklist, not a `Select`, so that constraint does not apply here.
