# Admin AI Governance Fail-Closed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Admin Console's AI provider, API-key, routing, quota, and guardrail screens show only API-authoritative state in pilot mode and block configuration writes whenever that state cannot be loaded.

**Architecture:** Keep the existing repository-backed `/ai/*` and `/guardrails/*` contracts. Extract the Admin AI-governance request lifecycle from `apps/admin-web/src/main.tsx` into a focused hook plus a pure status helper; it owns `loading | ready | unavailable` state, clears no secret except after a confirmed API response, and never substitutes fixture rows after a failed request.

**Tech Stack:** TypeScript, React 18 + Vite, `@evcp/api-client`, Prisma-backed Platform API, Node built-in test runner via `tsx`.

## Global Constraints

- This is an Admin-only UI safety slice; do not change Keycloak/OIDC, native credential, KMS, provider-adapter, or Prisma schema behavior.
- Pilot mode must never use `legacyUserEmail`, `x-mock-user-email`, a simulated session, fixture rows, or a default provider secret as an authoritative replacement for a failed Admin AI-governance API request.
- API-key plaintext and `secretCiphertext` must never be rendered, returned, logged, persisted in browser storage, or included in error text.
- Retain existing DTOs and endpoint methods: `listAiProviders`, `listAiApiKeys`, `listGuardrailEvents`, `createAiProvider`, `createAiApiKey`, `configureAiRoute`, `configureAiQuota`, and `createGuardrailRule`.
- Follow `CLAUDE.md`: new source files stay below 400 lines; use `@evcp/ui` components and shared CSS only.
- Test first with `node --import tsx --test`; run `pnpm typecheck` before every commit.

---

## File Structure

- Create: `apps/admin-web/src/lib/ai-governance-status.ts` — pure availability/error normalization.
- Create: `apps/admin-web/src/hooks/use-ai-governance.ts` — API load/mutation orchestration.
- Create: `tests/unit/admin-ai-governance-status.test.mjs` — pure state coverage.
- Create: `tests/unit/admin-ai-governance-hook-contract.test.mjs` — no-fallback/default-secret regression guard.
- Modify: `apps/admin-web/src/main.tsx:1-40,1001-1075,1469-1565,1700-1820,2160-2405,3270-3555` — consume hook, disable writes, display unavailable state.
- Modify: `tests/integration/frontend-api-bootstrap-contract.test.mjs`, `tests/e2e/sprint2-admin-governance-smoke.test.mjs`, and `docs/operations/real-mvp-frontend-api-bootstrap.md`.

## Task 1: Define API-authority state

**Files:**
- Create: `apps/admin-web/src/lib/ai-governance-status.ts`
- Test: `tests/unit/admin-ai-governance-status.test.mjs`

**Interfaces:**
- Produces `type AiGovernanceAvailability = "loading" | "ready" | "unavailable"`.
- Produces `canMutateAiGovernance(availability): boolean`.
- Produces `aiGovernanceUnavailableMessage(error): string`.

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";

const { aiGovernanceUnavailableMessage, canMutateAiGovernance } = await import(
  "../../apps/admin-web/src/lib/ai-governance-status.ts"
);

test("only ready governance state permits writes", () => {
  assert.equal(canMutateAiGovernance("loading"), false);
  assert.equal(canMutateAiGovernance("unavailable"), false);
  assert.equal(canMutateAiGovernance("ready"), true);
});

test("unavailable status never exposes a provider secret", () => {
  const message = aiGovernanceUnavailableMessage(new Error("failed sk-live-secret"));
  assert.equal(message, "AI governance data is unavailable. Refresh the page or sign in again.");
  assert.equal(message.includes("sk-live"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-ai-governance-status.test.mjs`

Expected: FAIL because `ai-governance-status.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type AiGovernanceAvailability = "loading" | "ready" | "unavailable";

export function canMutateAiGovernance(availability: AiGovernanceAvailability): boolean {
  return availability === "ready";
}

export function aiGovernanceUnavailableMessage(_error: unknown): string {
  return "AI governance data is unavailable. Refresh the page or sign in again.";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-ai-governance-status.test.mjs`

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/lib/ai-governance-status.ts tests/unit/admin-ai-governance-status.test.mjs
git commit -m "feat(admin): define AI governance availability state"
```

## Task 2: Extract API-authoritative governance hook

**Files:**
- Create: `apps/admin-web/src/hooks/use-ai-governance.ts`
- Test: `tests/unit/admin-ai-governance-hook-contract.test.mjs`

**Interfaces:**
- Consumes Task 1 helpers and `PlatformApiClient`.
- Produces `useAiGovernance(client)` with `availability`, `message`, `providers`, `apiKeys`, `guardrailEvents`, `reload`, and mutation methods.
- Every mutation throws before an API call unless availability is `ready`; `saveApiKey` rejects blank secrets and returns no plaintext.

- [ ] **Step 1: Write the failing contract test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/admin-web/src/hooks/use-ai-governance.ts", "utf8");

test("governance hook is API-authoritative and never invents a key", () => {
  assert.match(source, /export function useAiGovernance/);
  assert.match(source, /client\.listAiProviders\(\)/);
  assert.match(source, /client\.listAiApiKeys\(\)/);
  assert.match(source, /client\.listGuardrailEvents\(\)/);
  assert.match(source, /if \(!canMutateAiGovernance\(availability\)\)/);
  assert.match(source, /if \(!secret\.trim\(\)\)/);
  assert.doesNotMatch(source, /replace-before-production/);
  assert.doesNotMatch(source, /local fallback/);
  assert.doesNotMatch(source, /legacyUserEmail/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/unit/admin-ai-governance-hook-contract.test.mjs`

Expected: FAIL because `use-ai-governance.ts` does not exist.

- [ ] **Step 3: Write minimal hook implementation**

Start `apps/admin-web/src/hooks/use-ai-governance.ts` with this exact load path:

```ts
import type {
  AiApiKeyDto, AiProviderDto, AiQuotaDto, AiScenarioRouteDto, CreateAiApiKeyInput,
  CreateAiProviderInput, CreateGuardrailRuleInput, GuardrailEventDto, GuardrailRuleDto,
  PlatformApiClient
} from "@evcp/api-client";
import { useCallback, useEffect, useState } from "react";
import {
  aiGovernanceUnavailableMessage, canMutateAiGovernance, type AiGovernanceAvailability
} from "../lib/ai-governance-status";

type AiGovernanceSnapshot = {
  providers: AiProviderDto[];
  apiKeys: AiApiKeyDto[];
  guardrailEvents: GuardrailEventDto[];
};
const emptySnapshot: AiGovernanceSnapshot = { providers: [], apiKeys: [], guardrailEvents: [] };

export function useAiGovernance(client: PlatformApiClient) {
  const [availability, setAvailability] = useState<AiGovernanceAvailability>("loading");
  const [message, setMessage] = useState("Loading AI governance data.");
  const [snapshot, setSnapshot] = useState<AiGovernanceSnapshot>(emptySnapshot);

  const reload = useCallback(async () => {
    setAvailability("loading");
    setMessage("Loading AI governance data.");
    try {
      const [providers, apiKeys, guardrailEvents] = await Promise.all([
        client.listAiProviders(), client.listAiApiKeys(), client.listGuardrailEvents()
      ]);
      setSnapshot({ providers, apiKeys, guardrailEvents });
      setAvailability("ready");
      setMessage("Loaded AI governance data from Platform API.");
    } catch (error) {
      setSnapshot(emptySnapshot);
      setAvailability("unavailable");
      setMessage(aiGovernanceUnavailableMessage(error));
    }
  }, [client]);

  useEffect(() => { void reload(); }, [reload]);
  const requireReady = () => {
    if (!canMutateAiGovernance(availability)) throw new Error("AI governance API is unavailable");
  };
  const createProvider = async (input: CreateAiProviderInput): Promise<AiProviderDto> => {
    requireReady();
    const provider = await client.createAiProvider(input);
    setSnapshot((current) => ({ ...current, providers: [provider, ...current.providers.filter((item) => item.id !== provider.id)] }));
    setMessage(`Provider saved: ${provider.name}`);
    return provider;
  };
  const saveApiKey = async (input: Omit<CreateAiApiKeyInput, "secret">, secret: string): Promise<AiApiKeyDto> => {
    requireReady();
    if (!secret.trim()) throw new Error("Enter a provider secret before saving.");
    const key = await client.createAiApiKey({ ...input, secret });
    setSnapshot((current) => ({ ...current, apiKeys: [key, ...current.apiKeys.filter((item) => item.id !== key.id)] }));
    setMessage(`Masked key saved for ${key.providerId}.`);
    return key;
  };
  const configureRoute = async (input: Parameters<PlatformApiClient["configureAiRoute"]>[0]): Promise<AiScenarioRouteDto> => {
    requireReady();
    const route = await client.configureAiRoute(input);
    setMessage(`Route configured for ${route.scenario}.`);
    return route;
  };
  const configureQuota = async (input: AiQuotaDto): Promise<AiQuotaDto> => {
    requireReady();
    const quota = await client.configureAiQuota(input);
    setMessage(`Quota configured for ${quota.scope}.`);
    return quota;
  };
  const createGuardrailRule = async (input: CreateGuardrailRuleInput): Promise<GuardrailRuleDto> => {
    requireReady();
    const rule = await client.createGuardrailRule(input);
    const guardrailEvents = await client.listGuardrailEvents();
    setSnapshot((current) => ({ ...current, guardrailEvents }));
    setMessage(`Guardrail active: ${rule.name}`);
    return rule;
  };
  return { availability, message, ...snapshot, reload, createProvider, saveApiKey, configureRoute, configureQuota, createGuardrailRule };
}
```

The implementation above is complete for the five mutation methods. It clears no input; the page clears the secret only after the awaited call resolves.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/unit/admin-ai-governance-hook-contract.test.mjs`

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/hooks/use-ai-governance.ts tests/unit/admin-ai-governance-hook-contract.test.mjs
git commit -m "feat(admin): make AI governance API-authoritative"
```

## Task 3: Wire Admin UI to fail closed

**Files:**
- Modify: `apps/admin-web/src/main.tsx:1001-1075,1469-1565,1700-1820,2160-2405,3270-3555`
- Test: `tests/integration/frontend-api-bootstrap-contract.test.mjs`
- Test: `tests/e2e/sprint2-admin-governance-smoke.test.mjs`

**Interfaces:**
- Consumes `useAiGovernance(adminClient)`, where `adminClient` is memoized for the active browser session.
- Produces an `aria-live="polite"` unavailable panel and disables every AI-governance write button unless state is ready.

- [ ] **Step 1: Write failing regression assertions**

Append to the existing Admin governance contract test:

```js
assert.match(adminSource, /useAiGovernance/);
assert.match(adminSource, /AI governance data is unavailable/);
assert.doesNotMatch(adminSource, /Provider save failed; local fallback rows remain visible/);
assert.doesNotMatch(adminSource, /replace-before-production/);
```

Add to `tests/e2e/sprint2-admin-governance-smoke.test.mjs`:

```js
test("Admin governance renders unavailable guidance instead of fallback data", () => {
  const source = readFileSync("apps/admin-web/src/main.tsx", "utf8");
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Refresh AI governance data/);
  assert.doesNotMatch(source, /local fallback rows remain visible/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test tests/integration/frontend-api-bootstrap-contract.test.mjs tests/e2e/sprint2-admin-governance-smoke.test.mjs`

Expected: FAIL because `main.tsx` still owns fallback handlers and a default secret.

- [ ] **Step 3: Replace the in-component fallback behavior**

Import `useAiGovernance` and `canMutateAiGovernance`. In `AdminApp`, replace the old provider/key/event/source/message state, loader effect, and five helper functions with:

```tsx
const adminClient = useMemo(() => createAdminPlatformClient(), [sessionActive]);
const aiGovernance = useAiGovernance(adminClient);
const governanceWritesDisabled =
  !canMutateAiGovernance(aiGovernance.availability) || isSavingAiGovernance;
```

Delete the fallback catch branches that claim rows remain visible. Use `aiGovernance.providers`, `aiGovernance.apiKeys`, and `aiGovernance.guardrailEvents` for existing tables. Use the matching hook method in each handler. For keys, pass only `aiKeySecret`, reject blank input, and run `setAiKeySecret("")` only after success.

At the top of both AI Providers and Guardrails pages add:

```tsx
<div aria-live="polite">
  <DecisionPanel
    tone={aiGovernance.availability === "ready" ? "success" : "warning"}
    badge={aiGovernance.availability}
    title={aiGovernance.message}
    lines={["Configuration changes are disabled until Platform API data is available."]}
  />
  {aiGovernance.availability !== "ready" ? (
    <button type="button" className="secondary-button" onClick={() => void aiGovernance.reload()}>
      Refresh AI governance data
    </button>
  ) : null}
</div>
```

Replace every governance button's `disabled={isSavingAiGovernance}` with `disabled={governanceWritesDisabled}`.

- [ ] **Step 4: Run tests and typecheck**

Run: `node --import tsx --test tests/unit/admin-ai-governance-status.test.mjs tests/unit/admin-ai-governance-hook-contract.test.mjs tests/integration/frontend-api-bootstrap-contract.test.mjs tests/e2e/sprint2-admin-governance-smoke.test.mjs && pnpm typecheck`

Expected: PASS and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/main.tsx tests/integration/frontend-api-bootstrap-contract.test.mjs tests/e2e/sprint2-admin-governance-smoke.test.mjs
git commit -m "fix(admin): fail closed when AI governance API is unavailable"
```

## Task 4: Document the pilot behavior

**Files:**
- Modify: `docs/operations/real-mvp-frontend-api-bootstrap.md:85-91`
- Test: `tests/e2e/frontend-api-bootstrap-smoke.test.mjs`

**Interfaces:**
- Documents that Admin AI Governance has no local fallback in pilot mode; the wider multi-surface fallback migration remains separate work.

- [ ] **Step 1: Write failing documentation assertion**

Add a test that reads `docs/operations/real-mvp-frontend-api-bootstrap.md` and asserts it contains both `Admin AI governance is fail-closed` and `does not render fallback provider, key, route, quota, or guardrail data`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/e2e/frontend-api-bootstrap-smoke.test.mjs`

Expected: FAIL because the operational document lacks the invariant.

- [ ] **Step 3: Add the operational note**

Add this under `## Remaining Work`:

```md
### Admin AI governance pilot behavior

Admin AI governance is fail-closed in pilot mode. When its Platform API reads fail, the console clears the current provider, API-key, route, quota, and guardrail-event view, displays an unavailable state, and disables configuration writes until a successful refresh. It does not render fallback provider, key, route, quota, or guardrail data, and it never generates a replacement provider secret.
```

- [ ] **Step 4: Run full slice verification**

Run: `pnpm check:changed --base HEAD~4 && pnpm --filter @evcp/admin-web build && node --import tsx --test tests/unit/admin-ai-governance-status.test.mjs tests/unit/admin-ai-governance-hook-contract.test.mjs tests/integration/frontend-api-bootstrap-contract.test.mjs tests/e2e/sprint2-admin-governance-smoke.test.mjs tests/e2e/frontend-api-bootstrap-smoke.test.mjs`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs/operations/real-mvp-frontend-api-bootstrap.md tests/e2e/frontend-api-bootstrap-smoke.test.mjs
git commit -m "docs(admin): record fail-closed AI governance behavior"
```

## Self-Review

### Spec coverage

- This plan fixes the detected Admin-only pilot risk: static fallback rows and a replacement API-key secret can make failed backend configuration look successful.
- Existing real API routes and persistence are reused; no new schema, secret-store mechanism, or authentication model is invented.
- Keycloak/OIDC, KMS, AI workers, scoped cost accounting, and Creator/Store fallback removal are separate plans.

### Placeholder scan

The plan contains exact files, public names, test bodies, commands, expected results, and commit messages. The five hook mutation methods are named after the existing API-client methods and must use the stated ready guard and immutable update rule.

### Type consistency

`AiGovernanceAvailability`, `PlatformApiClient`, and AI DTO names match current `@evcp/api-client` exports. The page consumes `availability`, `message`, `providers`, `apiKeys`, and `guardrailEvents` from `useAiGovernance`.
