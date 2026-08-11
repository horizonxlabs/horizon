import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const loginSource = readFileSync("apps/admin-web/src/login-screen.tsx", "utf8");
const adminSource = readFileSync(
  "apps/admin-web/src/features/admin-console/AdminConsole.tsx",
  "utf8"
);
const uiStyles = readFileSync("packages/ui/styles.css", "utf8");
const { AdminLoginScreen } = await import("../../apps/admin-web/src/login-screen.tsx");

function renderLogin() {
  return renderToStaticMarkup(React.createElement(AdminLoginScreen, { onLoggedIn() {} }));
}

test("Admin login renders the approved split shell and role-specific copy", () => {
  const html = renderLogin();

  assert.match(html, /class="creator-auth-screen"/);
  assert.match(html, /class="creator-auth-shell"/);
  assert.match(html, /<aside class="creator-auth-brand" aria-hidden="true">/);
  assert.match(html, /src="\/horizon-mark\.png"/);
  assert.match(html, /class="horizon-brand-name">Horizon<\/span>/);
  assert.match(html, /Govern your platform with confidence\./);
  assert.match(html, /Monitor platform health, environments, and readiness/);
  assert.match(html, /Manage users, access policies, and enterprise authentication/);
  assert.match(html, /Review audit trails, guardrails, and release controls/);
  assert.match(html, /Enterprise Vibe Coding Platform/);
  assert.match(html, /<h1>Welcome back<\/h1>/);
  assert.match(html, /Sign in to the Admin Console/);
  assert.match(html, /Need admin access\? Contact your platform owner\./);
});

test("Admin login exposes the Keycloak redirect entry point", () => {
  const html = renderLogin();

  assert.match(html, /aria-label="Admin login"/);
  assert.match(html, /Continue with Keycloak/);
  assert.match(loginSource, /window\.location\.assign\(startAdminKeycloakLogin\(returnTo\)\)/);
});

test("Admin login keeps credentials and Keycloak tokens out of browser code", () => {
  assert.doesNotMatch(loginSource, /\/auth\/login|password|access_token|id_token/);
  assert.match(loginSource, /server-brokered OIDC flow/);
});

test("Admin sidebar retains only the accessible logout action", () => {
  assert.match(
    adminSource,
    /client\s*\?\.request\("\/auth\/logout", \{ method: "POST" \}\)/
  );
  assert.match(adminSource, /window\.location\.assign\(startAdminKeycloakLogout\(\)\)/);
  assert.doesNotMatch(adminSource, /Refresh Session/);
  assert.doesNotMatch(adminSource, /handleSignInBridge/);
});

test("Shared auth CSS covers responsive reflow, focus, hit targets, and reduced motion", () => {
  assert.match(
    uiStyles,
    /\.creator-auth-screen\s*\{[^}]*box-sizing: border-box;[^}]*min-height: 100(?:d)?vh;/s
  );
  assert.match(
    uiStyles,
    /@media \(min-width: 860px\)[\s\S]*?\.creator-auth-shell\s*\{[^}]*grid-template-columns: 1\.05fr 1fr;[^}]*max-width: 884px;/s
  );
  assert.match(uiStyles, /\.creator-auth-form\s*\{[^}]*box-sizing: border-box;[^}]*min-width: 0;/s);
  assert.match(
    uiStyles,
    /@media \(max-width: 480px\)[\s\S]*?\.creator-auth-form\s*\{[^}]*padding: var\(--evcp-space-6\);/s
  );
  assert.match(uiStyles, /\.creator-auth-eye\s*\{[^}]*min-height: 44px;[^}]*min-width: 44px;/s);
  assert.match(
    uiStyles,
    /\.creator-auth-field\s*\{[^}]*border: 1px solid var\(--evcp-color-muted, #64748b\);/s
  );
  assert.match(
    uiStyles,
    /\.creator-auth-field input::placeholder\s*\{[^}]*color: var\(--evcp-color-muted, #64748b\);/s
  );
  assert.match(uiStyles, /\.creator-auth-eye:focus-visible/);
  assert.match(uiStyles, /\.creator-auth-submit:focus-visible/);
  assert.match(
    uiStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.creator-auth-submit:hover:not\(:disabled\)[\s\S]*?transform: none;/s
  );
});
