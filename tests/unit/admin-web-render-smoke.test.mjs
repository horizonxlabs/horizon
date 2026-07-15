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
    const stubAi = {
      availability: "ready", message: "ok", providers: [], apiKeys: [], routes: [], quotas: [], guardrailEvents: [],
      reload() {}, createProvider() {}, saveApiKey() {}, configureRoute() {}, configureQuota() {}, createGuardrailRule() {}, testProvider() {}
    };
    const { AiProvidersConsole } = await import("./apps/admin-web/src/features/ai-governance/AiProvidersConsole.tsx");
    const { GuardrailsConsole } = await import("./apps/admin-web/src/features/guardrails/GuardrailsConsole.tsx");
    const providersHtml = renderToStaticMarkup(React.createElement(AiProvidersConsole, { ai: stubAi }));
    const guardrailsHtml = renderToStaticMarkup(React.createElement(GuardrailsConsole, { ai: stubAi }));
    if (!providersHtml.includes("AI Providers")) throw new Error("AiProvidersConsole did not render its title");
    if (!guardrailsHtml.includes("Guardrails")) throw new Error("GuardrailsConsole did not render its title");
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
