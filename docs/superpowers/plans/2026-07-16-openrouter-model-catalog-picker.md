# OpenRouter Model Catalog Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin selects OpenRouter in the Add-provider drawer, fetch OpenRouter's model catalog through Platform API and let them pick the provider's approved models from a searchable multi-select (chips), instead of typing model ids.

**Architecture:** New backend `provider-catalog` module fetches `${baseUrl}/models` (OpenAI-compatible, public) server-side; exposed as admin-only `POST /ai/provider-catalog`. api-client + hook plumb it to a feature-local `ModelCatalogPicker` (search + chips) that ProviderDrawer shows for OpenRouter, falling back to the free-text field on error. Raw `fetch` — no OpenRouter SDK (keeps the endpoint generic for future OpenAI-compatible providers; inference transport belongs to LiteLLM in a later slice).

**Tech Stack:** TypeScript, NestJS (platform-api), React + Vite (admin-web), `@evcp/ui`, Node test runner via `tsx`.

## Global Constraints

- Raw `fetch` only — do NOT add `@openrouter/sdk` or any new dependency.
- The catalog endpoint is generic (`${baseUrl}/models`); only OpenRouter is wired in the UI this slice. No LiteLLM / model-prefix / response_cost work.
- Credentials are NOT involved (the catalog is public and fetched before a key exists). Do not send any Authorization header from the catalog fetch.
- `PlatformRequest.path` (apps/platform-api/src/app-factory.ts) is a closed string-literal union — `/ai/provider-catalog` must be added to it or `request.path === "/ai/provider-catalog"` will not typecheck. app-factory.ts has ratchet headroom (~3588/3792); a +1-line union member is fine. Do NOT edit `scripts/quality/large-file-baseline.json`.
- Design system: no app-local CSS, inline visual styles, or hardcoded colors. Use only existing `@evcp/ui` token utility classes (`text-muted`, `text-body`, `border-border`, `bg-surface-muted`, `text-primary`, `rounded-control`, etc.).
- Files capped at 400 lines. New files stay well under.
- Stage ONLY the files each task touches — never `git add -A` (worktree carries unrelated WIP). No `--no-verify`. Do NOT run `git checkout/switch/stash/reset`.

---

### Task 1: Backend + api-client — `POST /ai/provider-catalog`

**Files:**
- Create: `apps/platform-api/src/ai-governance/provider-catalog.ts`
- Modify: `apps/platform-api/src/ai-governance/ai-governance-routes.ts` (import + route in the persisted dispatcher)
- Modify: `apps/platform-api/src/app-factory.ts` (add `/ai/provider-catalog` to the `PlatformRequest.path` union)
- Modify: `packages/api-client/src/ai-governance-types.ts` (new DTO)
- Modify: `packages/api-client/src/index.ts` (re-export DTO + `listProviderModelCatalog` method)
- Test: `tests/unit/provider-catalog.test.mjs`
- Test: `tests/unit/api-client-ai-reads.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `PlatformUser` from `../platform-services`; `success`, `failure`, `ApiResult` from `@evcp/api-client`; the persisted dispatcher's `resolvePersistenceUser(services, headers)`.
- Produces: `fetchProviderModelCatalog({ baseUrl, fetcher?, timeoutMs? }): Promise<{ models: { id: string; name: string; contextLength?: number }[] }>`; `handleProviderCatalogRoute({ request, user, fetcher? })`; DTO `ProviderModelCatalogDto`; client method `listProviderModelCatalog(baseUrl: string)`.

- [ ] **Step 1: Write the backend unit test (failing)**

Create `tests/unit/provider-catalog.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

const { fetchProviderModelCatalog, handleProviderCatalogRoute } = await import(
  "../../apps/platform-api/src/ai-governance/provider-catalog.ts"
);

const admin = { id: "u1", email: "admin@example.test", name: "Admin", role: "admin" };
const creator = { id: "u2", email: "c@example.test", name: "Creator", role: "creator" };

test("fetchProviderModelCatalog maps data[] to id/name/contextLength and sorts by id", async () => {
  let observed;
  const catalog = await fetchProviderModelCatalog({
    baseUrl: "https://openrouter.ai/api/v1/",
    fetcher: async (url, init) => {
      observed = { url: String(url), method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization") };
      return new Response(JSON.stringify({ data: [
        { id: "openai/gpt-4.1-mini", name: "OpenAI: GPT-4.1 Mini", context_length: 128000 },
        { id: "a/model", context_length: 0 }
      ] }), { status: 200 });
    }
  });
  assert.equal(observed.url, "https://openrouter.ai/api/v1/models");
  assert.equal(observed.method, "GET");
  assert.equal(observed.auth, null); // no credential sent
  assert.equal(catalog.models.length, 2);
  assert.deepEqual(catalog.models[0], { id: "a/model", name: "a/model" }); // sorted first; name defaults to id; contextLength 0 dropped
  assert.deepEqual(catalog.models[1], { id: "openai/gpt-4.1-mini", name: "OpenAI: GPT-4.1 Mini", contextLength: 128000 });
});

test("fetchProviderModelCatalog throws on non-2xx", async () => {
  await assert.rejects(
    () => fetchProviderModelCatalog({ baseUrl: "https://x/v1", fetcher: async () => new Response("nope", { status: 500 }) }),
    /HTTP 500/
  );
});

test("fetchProviderModelCatalog throws on transport error", async () => {
  await assert.rejects(
    () => fetchProviderModelCatalog({ baseUrl: "https://x/v1", fetcher: async () => { throw new Error("ECONNREFUSED"); } }),
    /Model catalog request failed/
  );
});

test("handleProviderCatalogRoute forbids non-admin", async () => {
  const res = await handleProviderCatalogRoute({
    request: { method: "POST", path: "/ai/provider-catalog", body: { baseUrl: "https://x/v1" } },
    user: creator,
    fetcher: async () => new Response(JSON.stringify({ data: [] }), { status: 200 })
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.ok, false);
});

test("handleProviderCatalogRoute returns 400 when baseUrl missing", async () => {
  const res = await handleProviderCatalogRoute({
    request: { method: "POST", path: "/ai/provider-catalog", body: {} },
    user: admin
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test("handleProviderCatalogRoute returns catalog for admin", async () => {
  const res = await handleProviderCatalogRoute({
    request: { method: "POST", path: "/ai/provider-catalog", body: { baseUrl: "https://openrouter.ai/api/v1" } },
    user: admin,
    fetcher: async () => new Response(JSON.stringify({ data: [{ id: "a/b", name: "A B" }] }), { status: 200 })
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.models[0].id, "a/b");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test tests/unit/provider-catalog.test.mjs`
Expected: FAIL — cannot import `provider-catalog.ts` (module does not exist yet).

- [ ] **Step 3: Create `provider-catalog.ts`**

Create `apps/platform-api/src/ai-governance/provider-catalog.ts`:

```ts
import { failure, success, type ApiResult } from "@evcp/api-client";
import { ValidationError } from "../platform-services";
import type { PlatformUser } from "../platform-services";

type Request = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};
export type ProviderModelCatalog = { models: Array<{ id: string; name: string; contextLength?: number }> };

export async function fetchProviderModelCatalog(input: {
  baseUrl: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<ProviderModelCatalog> {
  const baseUrl = input.baseUrl.trim();
  if (!baseUrl) throw new ValidationError("Provider base URL is required to load its model catalog");
  const fetcher = input.fetcher ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl.replace(/\/$/, "")}/models`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000)
    });
  } catch (error) {
    throw new ValidationError(
      `Model catalog request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) throw new ValidationError(`Model catalog request returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: Array<{ id?: unknown; name?: unknown; context_length?: unknown }>;
  };
  const models = (body.data ?? [])
    .map((entry) => {
      const id = String(entry.id ?? "").trim();
      const contextLength = Number(entry.context_length);
      return {
        id,
        name: String(entry.name ?? id).trim() || id,
        ...(Number.isFinite(contextLength) && contextLength > 0 ? { contextLength } : {})
      };
    })
    .filter((model) => model.id.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  return { models };
}

export async function handleProviderCatalogRoute(input: {
  request: Request;
  user: PlatformUser;
  fetcher?: typeof fetch;
}): Promise<{ status: number; body: ApiResult<ProviderModelCatalog> }> {
  if (input.user.role !== "admin") {
    return {
      status: 403,
      body: failure("FORBIDDEN", `Role ${input.user.role} cannot load the provider model catalog`)
    };
  }
  const baseUrl = String(input.request.body?.baseUrl ?? "").trim();
  if (!baseUrl) return { status: 400, body: failure("VALIDATION", "baseUrl is required") };
  const catalog = await fetchProviderModelCatalog({
    baseUrl,
    ...(input.fetcher ? { fetcher: input.fetcher } : {})
  });
  return { status: 200, body: success(catalog) };
}
```

- [ ] **Step 4: Run the backend test to verify it passes**

Run: `node --import tsx --test tests/unit/provider-catalog.test.mjs`
Expected: PASS (6/6).

- [ ] **Step 5: Wire the route into the persisted dispatcher**

In `apps/platform-api/src/ai-governance/ai-governance-routes.ts`, add the import near the top (with the other `./` imports):

```ts
import { handleProviderCatalogRoute } from "./provider-catalog";
```

Inside `handleAiGovernanceRoute`, within the `if (ctx.aiGovernancePersistence) { ... }` block, add this route check immediately after the `/ai/quotas` GET block (the one ending at the `}` after `listQuotas`):

```ts
    if (request.method === "POST" && request.path === "/ai/provider-catalog") {
      const user = await resolvePersistenceUser(services, request.headers ?? {});
      return handleProviderCatalogRoute({ request, user });
    }
```

- [ ] **Step 6: Add the path to the PlatformRequest union**

In `apps/platform-api/src/app-factory.ts`, find the `PlatformRequest` interface's `path:` string-literal union and add a member (place it near an existing `"/ai/..."` entry such as `"/ai/providers"`):

```ts
    | "/ai/provider-catalog"
```

- [ ] **Step 7: Add the api-client DTO + method + the api-client test**

In `packages/api-client/src/ai-governance-types.ts`, add:

```ts
export type ProviderModelCatalogDto = {
  models: Array<{ id: string; name: string; contextLength?: number }>;
};
```

In `packages/api-client/src/index.ts`: add `ProviderModelCatalogDto` to BOTH the `import type { ... } from "./ai-governance-types"` list AND the `export type { ... }` re-export list (alongside `AiProviderDto`). Then add this method to the `PlatformApiClient` class, next to `createAiProvider`:

```ts
  listProviderModelCatalog(baseUrl: string): Promise<ProviderModelCatalogDto> {
    return this.request<ProviderModelCatalogDto>("/ai/provider-catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl })
    });
  }
```

Append to `tests/unit/api-client-ai-reads.test.mjs`:

```js
test("listProviderModelCatalog POSTs baseUrl to /ai/provider-catalog", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observed.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      return new Response(JSON.stringify(success({ models: [{ id: "openai/gpt-4.1", name: "GPT-4.1" }] })), { status: 200 });
    }
  });

  const catalog = await client.listProviderModelCatalog("https://openrouter.ai/api/v1");

  assert.equal(observed.length, 1);
  assert.ok(observed[0].url.endsWith("/ai/provider-catalog"), `got ${observed[0].url}`);
  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(catalog.models[0].id, "openai/gpt-4.1");
});
```

- [ ] **Step 8: Run tests + typecheck**

Run: `node --import tsx --test tests/unit/provider-catalog.test.mjs tests/unit/api-client-ai-reads.test.mjs`
Expected: PASS (all).

Run: `pnpm typecheck`
Expected: PASS (the `request.path === "/ai/provider-catalog"` comparison now typechecks against the widened union; `ApiResult` return type is compatible with `PlatformResponse`).

- [ ] **Step 9: Commit**

```bash
git add apps/platform-api/src/ai-governance/provider-catalog.ts apps/platform-api/src/ai-governance/ai-governance-routes.ts apps/platform-api/src/app-factory.ts packages/api-client/src/ai-governance-types.ts packages/api-client/src/index.ts tests/unit/provider-catalog.test.mjs tests/unit/api-client-ai-reads.test.mjs
git commit -m "feat: add admin provider model catalog endpoint"
```

---

### Task 2: Frontend — searchable model picker in the drawer

**Files:**
- Create: `apps/admin-web/src/features/ai-governance/lib/model-catalog.ts`
- Create: `apps/admin-web/src/features/ai-governance/drawers/ModelCatalogPicker.tsx`
- Modify: `apps/admin-web/src/features/ai-governance/use-ai-governance.ts` (add `loadModelCatalog`)
- Modify: `apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx`
- Test: `tests/unit/ai-governance-model-filter.test.mjs`
- Test: `tests/unit/admin-web-render-smoke.test.mjs`

**Interfaces:**
- Consumes: `ProviderModelCatalogDto` + `PlatformApiClient.listProviderModelCatalog` (Task 1); `@evcp/ui` `Input`, `Button`, `Drawer`, `Field`, `Select`.
- Produces: `filterModels(models, query)`; hook `loadModelCatalog(baseUrl)`; `ModelCatalogPicker`.

- [ ] **Step 1: Write the filter test (failing)**

Create `tests/unit/ai-governance-model-filter.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

const { filterModels } = await import(
  "../../apps/admin-web/src/features/ai-governance/lib/model-catalog.ts"
);

const models = [
  { id: "openai/gpt-4.1-mini", name: "OpenAI: GPT-4.1 Mini" },
  { id: "anthropic/claude-sonnet-4-5", name: "Anthropic: Claude Sonnet 4.5" }
];

test("filterModels returns all for an empty/whitespace query", () => {
  assert.equal(filterModels(models, "").length, 2);
  assert.equal(filterModels(models, "   ").length, 2);
});

test("filterModels matches id case-insensitively", () => {
  const r = filterModels(models, "CLAUDE");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "anthropic/claude-sonnet-4-5");
});

test("filterModels matches name substring", () => {
  const r = filterModels(models, "mini");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "openai/gpt-4.1-mini");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test tests/unit/ai-governance-model-filter.test.mjs`
Expected: FAIL — cannot import `model-catalog.ts`.

- [ ] **Step 3: Create the filter helper**

Create `apps/admin-web/src/features/ai-governance/lib/model-catalog.ts`:

```ts
import type { ProviderModelCatalogDto } from "@evcp/api-client";

export type CatalogModel = ProviderModelCatalogDto["models"][number];

export function filterModels(models: CatalogModel[], query: string): CatalogModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (model) => model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q)
  );
}
```

- [ ] **Step 4: Run the filter test to verify it passes**

Run: `node --import tsx --test tests/unit/ai-governance-model-filter.test.mjs`
Expected: PASS (3/3).

- [ ] **Step 5: Add `loadModelCatalog` to the hook**

In `apps/admin-web/src/features/ai-governance/use-ai-governance.ts`:

Add `ProviderModelCatalogDto` to the type import block from `@evcp/api-client`. Add this callback (place it just before the `return {` at the end, after `testProvider`):

```ts
  const loadModelCatalog = useCallback(
    async (baseUrl: string): Promise<ProviderModelCatalogDto> => {
      if (!client) throw new Error("AI governance API is unavailable");
      return client.listProviderModelCatalog(baseUrl);
    },
    [client]
  );
```

Add `loadModelCatalog` to the returned object (after `testProvider`).

- [ ] **Step 6: Create `ModelCatalogPicker`**

Create `apps/admin-web/src/features/ai-governance/drawers/ModelCatalogPicker.tsx`:

```tsx
import { Input } from "@evcp/ui";
import { useEffect, useState } from "react";
import type { ProviderModelCatalogDto } from "@evcp/api-client";
import { filterModels, type CatalogModel } from "../lib/model-catalog";

type Props = {
  baseUrl: string;
  value: string[];
  onChange: (models: string[]) => void;
  loadCatalog: (baseUrl: string) => Promise<ProviderModelCatalogDto>;
  onUnavailable: () => void;
};

export function ModelCatalogPicker({ baseUrl, value, onChange, loadCatalog, onUnavailable }: Props) {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadCatalog(baseUrl)
      .then((catalog) => {
        if (!active) return;
        setModels(catalog.models);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
        onUnavailable();
      });
    return () => {
      active = false;
    };
  }, [baseUrl, loadCatalog, onUnavailable]);

  if (status === "loading") return <p className="text-sm text-muted">Loading model catalog…</p>;
  if (status === "error")
    return <p className="text-sm text-muted">Catalog unavailable — enter model ids manually below.</p>;

  const filtered = filterModels(models, query);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((m) => m !== id) : [...value, id]);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="inline-flex items-center gap-1 rounded-control border border-border bg-surface-muted px-2 py-1 text-xs text-body"
            >
              {id} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search models…" />
      <ul className="max-h-48 overflow-auto rounded-control border border-border">
        {filtered.map((model) => {
          const selected = value.includes(model.id);
          return (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => toggle(model.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm text-body ${selected ? "bg-surface-muted" : ""}`}
              >
                <span className="truncate">{model.name}</span>
                {selected && (
                  <span className="text-primary" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">No models match.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Integrate the picker into `ProviderDrawer`**

Replace `apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx` with:

```tsx
import { Button, Drawer, Field, Input, Select } from "@evcp/ui";
import { useState, type FormEvent } from "react";
import type { useAiGovernance } from "../use-ai-governance";
import { ModelCatalogPicker } from "./ModelCatalogPicker";

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
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const preset = PRESETS[adapter];
  const usePicker = adapter === "openrouter" && !catalogUnavailable;

  function selectAdapter(next: AdapterKind) {
    setAdapter(next);
    setBaseUrl(PRESETS[next].baseUrl);
    setSelectedModels([]);
    setCatalogUnavailable(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const modelList = usePicker
      ? selectedModels
      : models.split(",").map((m) => m.trim()).filter(Boolean);
    if (modelList.length === 0) {
      setError("Select at least one model.");
      return;
    }
    try {
      const provider = await ai.createProvider({
        name: name.trim(),
        adapter,
        baseUrl: baseUrl.trim(),
        models: modelList
      });
      onDone?.(`Provider ${provider.name} saved.`);
      setName(""); setBaseUrl(""); setModels(""); setSelectedModels([]);
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
        {usePicker ? (
          <Field label="Models">
            <ModelCatalogPicker
              baseUrl={baseUrl}
              value={selectedModels}
              onChange={setSelectedModels}
              loadCatalog={ai.loadModelCatalog}
              onUnavailable={() => setCatalogUnavailable(true)}
            />
          </Field>
        ) : (
          <Field label="Models (comma-separated)" hint="e.g. gpt-4.1, gpt-4.1-mini">
            <Input value={models} onChange={(e) => setModels(e.target.value)}
              placeholder={preset.model} required />
          </Field>
        )}
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

- [ ] **Step 8: Add render-smoke tests**

Append to `tests/unit/admin-web-render-smoke.test.mjs`:

```js
test("ModelCatalogPicker renders its loading state without throwing", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const { ModelCatalogPicker } = await import("./apps/admin-web/src/features/ai-governance/drawers/ModelCatalogPicker.tsx");
    const html = renderToStaticMarkup(React.createElement(ModelCatalogPicker, {
      baseUrl: "https://openrouter.ai/api/v1", value: [], onChange() {}, loadCatalog: async () => ({ models: [] }), onUnavailable() {}
    }));
    if (!html.includes("Loading model catalog")) throw new Error("ModelCatalogPicker did not render loading state");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("ProviderDrawer still renders its open state with the picker wired", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const stubAi = { createProvider() {}, loadModelCatalog: async () => ({ models: [] }) };
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

- [ ] **Step 9: Run tests + typecheck + design-system**

Run: `node --import tsx --test tests/unit/ai-governance-model-filter.test.mjs tests/unit/admin-web-render-smoke.test.mjs`
Expected: PASS (all, including the two prior render-smoke cases).

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm check:design-system`
Expected: PASS (only `@evcp/ui` token classes used; no hardcoded colors/inline styles).

- [ ] **Step 10: Commit**

```bash
git add apps/admin-web/src/features/ai-governance/lib/model-catalog.ts apps/admin-web/src/features/ai-governance/drawers/ModelCatalogPicker.tsx apps/admin-web/src/features/ai-governance/use-ai-governance.ts apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx tests/unit/ai-governance-model-filter.test.mjs tests/unit/admin-web-render-smoke.test.mjs
git commit -m "feat: searchable openrouter model picker in add-provider drawer"
```

---

## Self-review notes

- **Spec coverage:** backend endpoint (Task 1), api-client method (Task 1), hook `loadModelCatalog` + `filterModels` + `ModelCatalogPicker` + ProviderDrawer integration + fallback (Task 2), tests for all. Catalog fetch sends no Authorization (asserted). SSRF surface unchanged (admin-only, same egress).
- **Type consistency:** `ProviderModelCatalogDto.models[number]` is reused as `CatalogModel` in the UI; the backend `ProviderModelCatalog` shape matches the DTO field-for-field (`id`, `name`, optional `contextLength`).
- **Constraint respected:** raw fetch only (no SDK/dependency); `/ai/provider-catalog` added to the closed `PlatformRequest.path` union; no baseline edit; design-system token classes only.
- **Out of scope confirmed:** no LiteLLM, no LM Studio UI wiring, no server-side cache, no pricing display.
```
