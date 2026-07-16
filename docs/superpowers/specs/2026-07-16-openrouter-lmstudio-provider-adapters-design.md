# OpenRouter + LM Studio Provider Adapters — Design

**Date:** 2026-07-16
**Status:** Approved for planning
**Author:** platform (with Claude)

## Goal

Let a platform admin register **OpenRouter** and **LM Studio** as first-class AI
provider types on the AI Providers console, and have governed AI execution
(including the vibecode generation loop) call them successfully. This ships value
through the existing OpenAI-compatible transport — it does **not** touch LiteLLM.

## Context / current state

Two facts make this a small, self-contained slice:

- `AiProvider.adapter` is persisted as a free-form `String` in Prisma
  (`apps/platform-api/prisma/schema.prisma:319`), **not** a database enum. No
  migration is required — only the TypeScript union types and validation guards
  change.
- OpenRouter and LM Studio both expose OpenAI-compatible `/chat/completions`
  endpoints. The governed executor already routes any non-`anthropic` adapter
  through `invokeOpenAiCompatible` (`execution-runtime.ts:25`), so both providers
  work over the current direct-call transport once the validation guards accept
  their adapter values.

The adapter union today (`platform-services.ts:1288`) is
`"openai" | "anthropic" | "google" | "azure_openai" | "mock"`. Only `openai`,
`azure_openai` (admin test-call adapter selection) and `openai`/`anthropic`
(live executor) are actually wired; the rest are declared but rejected at
runtime.

This slice is the first step of the larger **Option B** design (governed
executor stays the governance brain; LiteLLM later becomes the transport that
normalizes providers and reports `response_cost`). The LiteLLM transport rewrite
is a **separate follow-on slice** and is explicitly out of scope here.

## Design

Add two adapter values — `openrouter` and `lm_studio` — and treat both as
OpenAI-compatible everywhere the platform selects a transport. Surface them in
the Add-provider drawer with prefilled base URLs and helpful hints.

### Touch points (6)

**Types — add `"openrouter" | "lm_studio"`:**
1. `apps/platform-api/src/platform-services.ts:1288` — `AiProviderAdapter` union.
2. `packages/api-client/src/ai-governance-types.ts:63` — `AiProviderAdapterDto`
   union (must stay identical to the API type).

**Validation / transport selection — treat both as OpenAI-compatible:**
3. `apps/platform-api/src/platform-services.ts:3487` — `createAdapter()`: add
   `openrouter` and `lm_studio` to the branch returning
   `OpenAiCompatibleCompletionAdapter` (this is the admin **test-call** path).
4. `apps/platform-api/src/ai-governance/execution-runtime.ts:49` — the live
   executor guard currently rejects anything other than `openai`/`anthropic`;
   permit `openrouter` and `lm_studio`. Line 25's ternary already falls through
   to `invokeOpenAiCompatible` for any non-`anthropic` adapter, so no change is
   needed there.

**UI:**
5. `apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx` —
   widen the adapter `useState` union, add two `<Select>` options, and prefill
   the base-URL / model placeholders per adapter:
   - OpenRouter → base URL `https://openrouter.ai/api/v1`, model e.g.
     `openai/gpt-4.1-mini`
   - LM Studio → base URL `http://host.docker.internal:1234/v1`, model = the
     model id loaded in LM Studio; credential hint that any non-empty value works
     (e.g. `lm-studio`)

**Tests:**
6. Extend coverage:
   - e2e (`tests/e2e/sprint2-admin-governance-smoke.test.mjs` or a sibling):
     create an `openrouter` and an `lm_studio` provider, configure a route, and
     run a governed/dry-run execution asserting the provider is accepted (not
     rejected by the executor guard).
   - render-smoke: the extended `ProviderDrawer` renders for the new adapter
     selections without throwing.

### Design decisions (settled)

- **LM Studio still requires a credential.** The platform mandates an API key
  per provider; LM Studio accepts any non-empty value. The drawer hints this
  rather than special-casing "no key".
- **Base URLs are prefilled, not locked.** An org may run LM Studio on a
  different host/port, or route OpenRouter through a mirror. Prefill is a
  convenience default only.
- **No OpenRouter attribution headers** (`HTTP-Referer` / `X-Title`). YAGNI for
  this slice; the direct adapter sends none today and works.
- **No new Prisma migration.** `adapter` remains a free-form string column;
  mappers cast to the widened union.

### Out of scope (follow-on LiteLLM slice)

- Routing governed execution **through** the LiteLLM proxy.
- LiteLLM model-prefix mapping (`openrouter/…`, `lm_studio/…`).
- `configurable_clientside_auth_params` allowlist in `docker/litellm-config.yaml`.
- Consuming LiteLLM `response_cost` for cost evidence (the reader at
  `execution-runtime.ts:129` already tolerates its absence).

## Testing strategy

- Node built-in test runner via `tsx` (repo convention), memory persistence
  mode for the executor path so no real Postgres/OpenBao is needed.
- Assert the two new adapters are **accepted** by `createAdapter()` and the
  live-executor guard, and that still-unsupported values (`google`, `mock`) are
  still rejected by the executor guard, with `azure_openai` test-call behavior
  unchanged.
- Render-smoke for the drawer, per `docs/ARCHITECTURE.md` conventions.

## Risks

- Low. The change is additive to a free-form column and a fall-through
  transport branch. The main correctness point is keeping the two union types
  (`AiProviderAdapter` and `AiProviderAdapterDto`) byte-for-byte in sync.
