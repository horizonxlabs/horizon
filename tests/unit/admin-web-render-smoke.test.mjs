import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const [main, routes] = await Promise.all([
  readFile("apps/admin-web/src/main.tsx", "utf8"),
  readFile("apps/admin-web/src/routes/AdminRoutes.tsx", "utf8")
]);

assert.match(main, /@\/app\/AdminApp/);
assert.match(routes, /@\/features\/auth-sso/);
assert.doesNotMatch(main, /function AdminApp/);

test("AdminApp renders its initial root state without throwing", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    const values = new Map();
    const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
    globalThis.React = React;
    globalThis.window = { location: { pathname: "/admin", hash: "" }, history: { replaceState() {} }, localStorage, setTimeout() { return 0; } };
    globalThis.document = { getElementById: () => null, createElement: () => ({ style: {} }) };
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    const { AdminApp } = await import("./apps/admin-web/src/app/AdminApp.tsx");
    const html = renderToStaticMarkup(React.createElement(AdminApp));
    if (!html.includes("Loading")) throw new Error("Admin root loading state did not render");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("AiProvidersConsole and GuardrailsConsole render distinct content with a stub hook", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const sampleProvider = {
      id: "provider-1", name: "OpenAI", adapter: "openai", baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4o"], status: "active"
    };
    const sampleKey = {
      id: "key-1", providerId: "provider-1", name: "Prod key", usageMode: "production",
      fingerprint: "abc123", maskedValue: "sk-***abc", status: "active"
    };
    const sampleExecution = {
      id: "exec-1", requestId: "req-1", actorId: "actor-1", projectId: "project-1", scenario: "prd_generation",
      providerId: "provider-1", model: "gpt-4o", status: "succeeded", tokensUsed: 120, latencyMs: 340,
      costUsd: 0.0042, fallbackUsed: false, quotaScope: "org", quotaTokensReserved: 200, occurredAt: "2026-07-15T00:00:00.000Z"
    };
    const stubAi = {
      availability: "ready", message: "ok", providers: [sampleProvider], apiKeys: [sampleKey], routes: [], quotas: [], guardrailEvents: [],
      executions: [sampleExecution],
      reload() {}, createProvider() {}, updateProvider() {}, setProviderStatus() {}, removeProvider() {}, setCredentialStatus() {}, removeCredential() {},
      saveApiKey() {}, configureRoute() {}, configureQuota() {}, createGuardrailRule() {}, testProvider() {}
    };
    const { AiProvidersConsole } = await import("./apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx");
    const { GuardrailsConsole } = await import("./apps/admin-web/src/features/guardrails/GuardrailsConsole.tsx");
    const providersHtml = renderToStaticMarkup(React.createElement(AiProvidersConsole, { ai: stubAi }));
    const guardrailsHtml = renderToStaticMarkup(React.createElement(GuardrailsConsole, { ai: stubAi }));
    if (!providersHtml.includes("AI Providers")) throw new Error("AiProvidersConsole did not render its title");
    if (!guardrailsHtml.includes("Guardrails")) throw new Error("GuardrailsConsole did not render its title");
    if (!providersHtml.includes("Disable")) throw new Error("AiProvidersConsole did not render a provider Disable control");
    if ((providersHtml.match(/Delete/g) ?? []).length < 1) throw new Error("AiProvidersConsole did not render a provider Delete control");
    if (!providersHtml.includes("Edit")) throw new Error("AiProvidersConsole did not render a provider Edit control");
    if (!providersHtml.includes("Routing")) throw new Error("AiProvidersConsole did not render the Routing tab label");
    if (!providersHtml.includes("Quota")) throw new Error("AiProvidersConsole did not render the Quota tab label");
    if (!providersHtml.includes("Usage")) throw new Error("AiProvidersConsole did not render the Usage tab label");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("AiProvidersConsole uses the Tabs primitive with tab state", async () => {
  const source = await readFile("apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx", "utf8");
  assert.match(source, /import\s*\{[^}]*\bTabs\b[^}]*\}\s*from\s*"@evcp\/ui"/);
  assert.match(source, /useState<TabId>/);
});

test("ProviderCard wires status badge, enable/disable, and delete handlers", async () => {
  const card = await readFile("apps/admin-web/src/features/ai-governance/ProviderCard.tsx", "utf8");
  assert.match(card, /provider\.status/);
  assert.match(card, /onDelete/);
  assert.match(card, /onSetStatus/);
});

test("UsersConsole renders its title with a stub client", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const stubClient = {
      request: async () => ({}),
      requestWithMeta: async () => ({ data: [], meta: { first: 0, max: 10, total: 0 } })
    };
    const { UsersConsole } = await import("./apps/admin-web/src/features/user-management/UsersConsole.tsx");
    const html = renderToStaticMarkup(React.createElement(UsersConsole, { client: stubClient }));
    if (!html.includes("Users")) throw new Error("UsersConsole did not render its title");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("AdminRoutes retains setup and session guard selection", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    globalThis.window = { localStorage: { getItem() { return null; } } };
    const { AdminRoutes } = await import("./apps/admin-web/src/routes/AdminRoutes.tsx");
    const props = { sessionActive: false, onSetupComplete() {}, onLoggedIn() {} };
    const setup = renderToStaticMarkup(React.createElement(AdminRoutes, { ...props, setupStatus: "incomplete" }));
    const login = renderToStaticMarkup(React.createElement(AdminRoutes, { ...props, setupStatus: "complete" }));
    if (!setup.includes("First-time setup") || !login.includes("Admin login")) throw new Error("Admin route guard selection regressed");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

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
    // Content is portaled by Radix Dialog, so nothing renders under SSR; we only assert the render itself does not throw.
    void renderToStaticMarkup(React.createElement(ProviderDrawer, { open: true, onClose() {}, ai: stubAi }));
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

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
    // Content is portaled by Radix Dialog, so nothing renders under SSR; we only assert the render itself does not throw.
    void renderToStaticMarkup(React.createElement(ProviderDrawer, { open: true, onClose() {}, ai: stubAi }));
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("ProviderDrawer renders edit mode with the editProvider prop", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const editProvider = {
      id: "provider-1", name: "OpenAI", adapter: "openai", baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4o"], status: "active"
    };
    const stubAi = { updateProvider() {}, loadModelCatalog: async () => ({ models: [] }) };
    const { ProviderDrawer } = await import("./apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx");
    // Content is portaled by Radix Dialog, so nothing renders under SSR; we only assert the render itself does not throw.
    void renderToStaticMarkup(React.createElement(ProviderDrawer, { open: true, onClose() {}, ai: stubAi, editProvider }));
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("ProviderDrawer and AiProvidersConsole source references edit-provider wiring", async () => {
  const drawer = await readFile("apps/admin-web/src/features/ai-governance/drawers/ProviderDrawer.tsx", "utf8");
  const console = await readFile("apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx", "utf8");
  assert.match(drawer, /editProvider/);
  assert.match(console, /setEditProvider/);
  assert.match(console, /onEdit/);
});

test("use-ai-governance hook loads AI usage logs and AiProvidersConsole renders a Usage tab", async () => {
  const hook = await readFile("apps/admin-web/src/features/ai-governance/use-ai-governance.ts", "utf8");
  const console = await readFile("apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx", "utf8");
  assert.match(hook, /client\.listAiUsage\(\)/);
  assert.match(hook, /executions/);
  assert.match(console, /"usage"/);
  assert.match(console, /Usage logs/);
});

test("SystemUpdatePanel renders the current version and app service tags with a stub client", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const stubClient = {
      getSystemVersion: async () => ({
        currentVersion: "v1.3.0",
        imageRepository: "registry.example.com/evcp",
        appServices: [{ name: "evcp_platform-api", image: "registry.example.com/evcp/evcp-platform-api:v1.3.0", tag: "v1.3.0" }]
      }),
      updateSystemVersion: async () => ({ accepted: true, targetVersion: "v1.3.0" })
    };
    const { SystemUpdatePanel } = await import("./apps/admin-web/src/features/platform-operations/SystemUpdatePanel.tsx");
    const html = renderToStaticMarkup(React.createElement(SystemUpdatePanel, { client: stubClient }));
    if (!html.includes("Platform version")) throw new Error("SystemUpdatePanel did not render its title");
    if (!html.includes("Target tag")) throw new Error("SystemUpdatePanel did not render the target-tag field");
    if (!html.includes("Update")) throw new Error("SystemUpdatePanel did not render the Update control");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("use-system-update polls getSystemVersion and retries through errors, and AdminConsole wires the System page", async () => {
  const hook = await readFile("apps/admin-web/src/features/platform-operations/use-system-update.ts", "utf8");
  const consoleSource = await readFile("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");
  const routeSource = await readFile("apps/admin-web/src/features/admin-console/admin-routes.ts", "utf8");
  const nav = await readFile("packages/config/src/index.ts", "utf8");
  assert.match(hook, /client\.getSystemVersion\(\)/);
  assert.match(hook, /client\.updateSystemVersion\(/);
  assert.match(hook, /"idle"/);
  assert.match(hook, /"updating"/);
  assert.match(hook, /"done"/);
  assert.match(hook, /"error"/);
  assert.match(consoleSource, /SystemUpdatePanel/);
  assert.match(routeSource, /"\/admin\/system": "system"/);
  assert.match(nav, /"\/admin\/system"/);
});

test("DomainPanel renders the current domain, a domain input, and a Go live control with a stub client", () => {
  const probe = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    globalThis.React = React;
    const stubClient = {
      getDomainStatus: async () => ({ domain: "app.example.com", publicBaseUrl: "https://app.example.com/api", caddyAddress: "app.example.com" }),
      setDomain: async () => ({ accepted: true, domain: "app.example.com" })
    };
    const { DomainPanel } = await import("./apps/admin-web/src/features/platform-operations/DomainPanel.tsx");
    const html = renderToStaticMarkup(React.createElement(DomainPanel, { client: stubClient }));
    if (!html.includes("Public domain")) throw new Error("DomainPanel did not render its title");
    if (!html.includes("Domain")) throw new Error("DomainPanel did not render the domain field");
    if (!html.includes("Go live")) throw new Error("DomainPanel did not render the Go live control");
  `;
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", probe], {
      env: { ...process.env, TSX_TSCONFIG_PATH: "apps/admin-web/tsconfig.json" },
      stdio: "pipe"
    })
  );
});

test("DomainPanel warns to point DNS at this server before go-live", async () => {
  const panel = await readFile("apps/admin-web/src/features/platform-operations/DomainPanel.tsx", "utf8");
  assert.match(panel, /DNS/);
  assert.match(panel, /storage\.\{trimmed\}/);
});

test("use-domain polls getDomainStatus and retries through errors, and AdminConsole wires the Domain page", async () => {
  const hook = await readFile("apps/admin-web/src/features/platform-operations/use-domain.ts", "utf8");
  const consoleSource = await readFile("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");
  const routeSource = await readFile("apps/admin-web/src/features/admin-console/admin-routes.ts", "utf8");
  const nav = await readFile("packages/config/src/index.ts", "utf8");
  assert.match(hook, /client\.getDomainStatus\(\)/);
  assert.match(hook, /client\.setDomain\(/);
  assert.match(hook, /"idle"/);
  assert.match(hook, /"applying"/);
  assert.match(hook, /"live"/);
  assert.match(hook, /"error"/);
  assert.match(consoleSource, /DomainPanel/);
  assert.match(routeSource, /"\/admin\/domain": "domain"/);
  assert.match(nav, /"\/admin\/domain"/);
});
