# OpenRouter + LM Studio Provider Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a platform admin register OpenRouter and LM Studio as first-class AI provider types, and have governed AI execution (including the vibecode loop) call them over the existing OpenAI-compatible transport.

**Architecture:** Add two adapter values (`openrouter`, `lm_studio`) to the `AiProviderAdapter` union and its api-client mirror. Both are OpenAI-compatible, so every transport-selection point treats them like `openai`. The Add-provider drawer gains preset base URLs and hints. No Prisma migration — `AiProvider.adapter` is a free-form `String` column.

**Tech Stack:** TypeScript, NestJS (platform-api), React + Vite (admin-web), `@evcp/ui` design system, Node built-in test runner via `tsx`.

## Global Constraints

- `AiProviderAdapter` (`apps/platform-api/src/platform-services.ts`) and `AiProviderAdapterDto` (`packages/api-client/src/ai-governance-types.ts`) MUST stay byte-for-byte identical in their member sets. `tests/integration/platform-ai-provider-adapter-contract.test.mjs` guards this — run it.
- No new Prisma migration; `adapter` stays a free-form string column.
- OpenRouter and LM Studio route through the **existing** OpenAI-compatible transport (`invokeOpenAiCompatible` / `OpenAiCompatibleCompletionAdapter`). Do NOT introduce LiteLLM routing, model prefixes, attribution headers, or `response_cost` handling — those are a separate follow-on slice (see the design doc).
- Files are capped at 400 lines. `ProviderDrawer.tsx` stays well under.
- Design system: no app-local CSS, inline visual styles, or hardcoded colors outside `packages/ui`. Reuse existing `@evcp/ui` tokens/classes (`text-muted`, etc.).
- Stage only the files each task touches — never `git add -A` (the worktree carries unrelated WIP). Do not use `--no-verify`.

---

### Task 1: Backend — accept `openrouter` and `lm_studio` adapters

**Files:**
- Modify: `apps/platform-api/src/platform-services.ts` (union at :1288, `createAdapter()` at :3486-3492)
- Modify: `packages/api-client/src/ai-governance-types.ts` (:63)
- Modify: `apps/platform-api/src/ai-governance/execution-runtime.ts` (guard at :49)
- Test: `tests/unit/persisted-ai-execution-runtime.test.mjs` (governed path)
- Test: `tests/e2e/sprint2-admin-governance-smoke.test.mjs` (test-call / `createAdapter` path)

**Interfaces:**
- Consumes: `AiProviderAdapter` string union; `createPersistedGovernedAiExecutor(client, { fetcher, executionStore })`; `MemoryAiGovernancePersistenceClient`; `MemoryAiSecretStore`; `executePlatformApiRequest(services, request)`.
- Produces: `AiProviderAdapter` and `AiProviderAdapterDto` both include `"openrouter"` and `"lm_studio"`; the live executor and `createAdapter()` accept both as OpenAI-compatible.

- [ ] **Step 1: Add the two governed-path tests (failing)**

Append to `tests/unit/persisted-ai-execution-runtime.test.mjs`. First add two module-level secret writes next to the existing ones (after line 18):

```js
await secretStore.write("aik_openrouter", "or-secret");
await secretStore.write("aik_lmstudio", "lm-secret");
```

Then append at end of file:

```js
for (const variant of [
  { adapter: "openrouter", keyId: "aik_openrouter", secret: "or-secret", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  { adapter: "lm_studio", keyId: "aik_lmstudio", secret: "lm-secret", baseUrl: "http://host.docker.internal:1234/v1", model: "local-model" }
]) {
  test(`persisted executor accepts ${variant.adapter} over the OpenAI-compatible transport`, async () => {
    const client = new MemoryAiGovernancePersistenceClient({
      providers: [{ id: `aip_${variant.adapter}`, name: variant.adapter, adapter: variant.adapter, baseUrl: variant.baseUrl, models: [variant.model], status: "active", createdAt: now }],
      apiKeys: [{ id: variant.keyId, providerId: `aip_${variant.adapter}`, name: "primary", usageMode: "production", quotaTokens: 1000, fallbackPriority: 0, fingerprint: "sha256:abc", maskedValue: "***test", secretCiphertext: `memory://ai-provider-keys/${variant.keyId}`, keyVersion: 1, encryptionProvider: "memory-test-only", status: "active", createdAt: now }],
      routes: [{ id: `air_${variant.adapter}`, scenario: "frontend_coding", primaryProviderId: `aip_${variant.adapter}`, primaryModel: variant.model, createdAt: now }]
    });
    let observed;
    const executor = createPersistedGovernedAiExecutor(client, {
      fetcher: async (url, init) => {
        observed = { url, authorization: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { total_tokens: 12 } }), { status: 200 });
      }
    });
    const result = await executor.execute(actor, { scenario: "frontend_coding", projectId: "p1", prompt: "Build a view", requestId: `req_${variant.adapter}` });
    assert.equal(result.status, "succeeded");
    assert.equal(observed.url, `${variant.baseUrl}/chat/completions`);
    assert.equal(observed.authorization, `Bearer ${variant.secret}`);
    assert.equal(observed.body.model, variant.model);
  });
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --import tsx --test tests/unit/persisted-ai-execution-runtime.test.mjs`
Expected: the two new cases FAIL — `executor.execute` rejects with `AI provider adapter openrouter is not supported by the live executor` (and the `lm_studio` equivalent), thrown from `resolveProvider`.

- [ ] **Step 3: Widen the executor guard**

In `apps/platform-api/src/ai-governance/execution-runtime.ts`, line 49, replace:

```ts
  if (provider.adapter !== "openai" && provider.adapter !== "anthropic") throw new Error(`AI provider adapter ${provider.adapter} is not supported by the live executor`);
```

with:

```ts
  if (provider.adapter !== "openai" && provider.adapter !== "openrouter" && provider.adapter !== "lm_studio" && provider.adapter !== "anthropic") throw new Error(`AI provider adapter ${provider.adapter} is not supported by the live executor`);
```

(Leave line 25's `provider.adapter === "anthropic" ? invokeAnthropic : invokeOpenAiCompatible` unchanged — `openrouter`/`lm_studio` correctly fall through to `invokeOpenAiCompatible`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/unit/persisted-ai-execution-runtime.test.mjs`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Widen the type unions**

In `apps/platform-api/src/platform-services.ts`, line 1288:

```ts
export type AiProviderAdapter = "openai" | "openrouter" | "lm_studio" | "anthropic" | "google" | "azure_openai" | "mock";
```

In `packages/api-client/src/ai-governance-types.ts`, line 63:

```ts
export type AiProviderAdapterDto = "openai" | "openrouter" | "lm_studio" | "anthropic" | "google" | "azure_openai" | "mock";
```

- [ ] **Step 6: Widen `createAdapter()` (admin test-call transport selection)**

In `apps/platform-api/src/platform-services.ts`, replace the `createAdapter` guard (around :3487):

```ts
    if (provider.adapter === "openai" || provider.adapter === "azure_openai")
      return new OpenAiCompatibleCompletionAdapter(this.runtime);
```

with:

```ts
    if (
      provider.adapter === "openai" ||
      provider.adapter === "openrouter" ||
      provider.adapter === "lm_studio" ||
      provider.adapter === "azure_openai"
    )
      return new OpenAiCompatibleCompletionAdapter(this.runtime);
```

- [ ] **Step 7: Add the test-call e2e coverage (failing → passing in one step, since the guard is already updated)**

Append to `tests/e2e/sprint2-admin-governance-smoke.test.mjs`:

```js
test("Sprint 2 API accepts OpenRouter and LM Studio providers for governed test calls", () => {
  const services = createPlatformApiServices();
  for (const variant of [
    { name: "OpenRouter Gateway", adapter: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
    { name: "LM Studio Local", adapter: "lm_studio", baseUrl: "http://host.docker.internal:1234/v1", model: "local-model" }
  ]) {
    const provider = executePlatformApiRequest(services, {
      method: "POST", path: "/ai/providers", headers: adminHeaders,
      body: { name: variant.name, adapter: variant.adapter, baseUrl: variant.baseUrl, models: [variant.model] }
    });
    assert.equal(provider.status, 201);
    executePlatformApiRequest(services, {
      method: "POST", path: "/ai/api-keys", headers: adminHeaders,
      body: { providerId: provider.body.data.id, name: "Key", secret: "sk-any-value", usageMode: "production", quotaTokens: 100000, fallbackPriority: 1 }
    });
    executePlatformApiRequest(services, {
      method: "POST", path: "/ai/routes", headers: adminHeaders,
      body: { scenario: "prd_generation", primaryProviderId: provider.body.data.id, primaryModel: variant.model }
    });
    const result = executePlatformApiRequest(services, {
      method: "POST", path: "/ai/provider-test-call", headers: adminHeaders,
      body: { scenario: "prd_generation", prompt: "Validate provider route", dryRun: true }
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.data.status, "succeeded");
  }
});
```

- [ ] **Step 8: Run the e2e file + the adapter contract + typecheck**

Run: `node --import tsx --test tests/e2e/sprint2-admin-governance-smoke.test.mjs`
Expected: PASS (existing tests plus the new one).

Run: `node --import tsx --test tests/integration/platform-ai-provider-adapter-contract.test.mjs`
Expected: PASS (the two unions stay in sync).

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/platform-api/src/platform-services.ts apps/platform-api/src/ai-governance/execution-runtime.ts packages/api-client/src/ai-governance-types.ts tests/unit/persisted-ai-execution-runtime.test.mjs tests/e2e/sprint2-admin-governance-smoke.test.mjs
git commit -m "feat: accept openrouter and lm_studio provider adapters"
```

---

### Task 2: Admin — OpenRouter / LM Studio presets in the Add-provider drawer

**Files:**
- Modify: `apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx`
- Test: `tests/unit/admin-web-render-smoke.test.mjs`

**Interfaces:**
- Consumes: `AiProviderAdapterDto` (widened in Task 1) via `ai.createProvider({ name, adapter, baseUrl, models })`; `@evcp/ui` `Drawer`, `Field`, `Input`, `Select`, `Button`.
- Produces: the drawer offers four adapter options; selecting one prefills its base URL; LM Studio shows a credential note.

- [ ] **Step 1: Add the source-scan + render-smoke tests (failing)**

Append to `tests/unit/admin-web-render-smoke.test.mjs`:

```js
test("ProviderDrawer exposes OpenRouter and LM Studio presets", async () => {
  const drawer = await readFile("apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx", "utf8");
  assert.match(drawer, /value="openrouter"/);
  assert.match(drawer, /value="lm_studio"/);
  assert.match(drawer, /https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(drawer, /host\.docker\.internal:1234/);
});

test("ProviderDrawer renders its open state without throwing", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const stubAi = { createProvider() {} };
    const { ProviderDrawer } = await import("./apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx");
    const html = renderToStaticMarkup(React.createElement(ProviderDrawer, { open: true, onClose() {}, ai: stubAi }));
    if (!html.includes("Add provider")) throw new Error("ProviderDrawer did not render its title");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});
```

- [ ] **Step 2: Run to verify the source-scan fails**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs`
Expected: the "exposes OpenRouter and LM Studio presets" case FAILS (no `value="openrouter"` yet). The render case may already pass.

- [ ] **Step 3: Rewrite `ProviderDrawer.tsx` with presets**

Replace the whole file with:

```tsx
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";

type Props = { open: boolean; onClose: () => void; ai: ReturnType<typeof useAiGovernance>; onDone?: (msg: string) => void };

type AdapterKind = "openai" | "openrouter" | "lm_studio" | "anthropic";

const PRESETS: Record<AdapterKind, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://gateway.example/v1", model: "gpt-4.1" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  lm_studio: { baseUrl: "http://host.docker.internal:1234/v1", model: "local-model-id" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" }
};

export function ProviderDrawer({ open, onClose, ai, onDone }: Props) {
  const [name, setName] = useState("");
  const [adapter, setAdapter] = useState<AdapterKind>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [error, setError] = useState<string>();
  const preset = PRESETS[adapter];

  function selectAdapter(next: AdapterKind) {
    setAdapter(next);
    setBaseUrl(PRESETS[next].baseUrl);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const provider = await ai.createProvider({
        name: name.trim(), adapter, baseUrl: baseUrl.trim(),
        models: models.split(",").map((m) => m.trim()).filter(Boolean)
      });
      onDone?.(`Provider ${provider.name} saved.`);
      setName(""); setBaseUrl(""); setModels("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provider could not be saved.");
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add provider" description="Register an approved AI endpoint.">
      <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Adapter">
          <Select value={adapter} onChange={(e) => selectAdapter(e.target.value as AdapterKind)}>
            <option value="openai">OpenAI-compatible</option>
            <option value="openrouter">OpenRouter</option>
            <option value="lm_studio">LM Studio (local)</option>
            <option value="anthropic">Anthropic native</option>
          </Select>
        </Field>
        <Field label="Provider base URL">
          <Input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={preset.baseUrl} required />
        </Field>
        <Field label="Models (comma-separated)" hint="e.g. gpt-4.1, gpt-4.1-mini">
          <Input value={models} onChange={(e) => setModels(e.target.value)}
            placeholder={preset.model} required />
        </Field>
        {adapter === "lm_studio" && (
          <p className="text-xs text-muted">
            LM Studio ignores the API key — add any non-empty value (e.g. lm-studio) in the credential step.
          </p>
        )}
        {error && <p className="text-sm text-danger-strong">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save provider</Button>
        </div>
      </form>
    </Drawer>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/unit/admin-web-render-smoke.test.mjs`
Expected: PASS (both new cases plus existing).

- [ ] **Step 5: Typecheck + design-system check**

Run: `pnpm typecheck`
Expected: PASS (widened `AiProviderAdapterDto` from Task 1 accepts `openrouter`/`lm_studio` in `createProvider`).

Run: `pnpm check:design-system`
Expected: PASS (no app-local styles; only existing `@evcp/ui` token classes used).

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx tests/unit/admin-web-render-smoke.test.mjs
git commit -m "feat: openrouter and lm studio presets in add-provider drawer"
```

---

## Self-review notes

- **Spec coverage:** all six touch points from the design doc are covered — union (Task 1 Step 5), DTO (Step 5), `createAdapter` (Step 6), executor guard (Step 3), UI (Task 2 Step 3), tests (both tasks).
- **Type consistency:** both unions get the identical two new members in the same step; the contract test in Step 8 guards drift.
- **Out-of-scope respected:** no LiteLLM routing, prefixes, attribution headers, or `response_cost` work appears in any task.
