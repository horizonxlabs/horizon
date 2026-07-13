import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const loginSource = readFileSync("apps/admin-web/src/login-screen.tsx", "utf8");
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
  assert.match(html, /src="\/horizon-logo\.png"/);
  assert.match(html, /Govern your platform with confidence\./);
  assert.match(html, /Monitor platform health, environments, and readiness/);
  assert.match(html, /Manage users, access policies, and enterprise authentication/);
  assert.match(html, /Review audit trails, guardrails, and release controls/);
  assert.match(html, /Enterprise Vibe Coding Platform/);
  assert.match(html, /<h1>Welcome back<\/h1>/);
  assert.match(html, /Sign in to the Admin Console/);
  assert.match(html, /Need admin access\? Contact your platform owner\./);
});

test("Admin login exposes labeled native controls and an accessible password toggle", () => {
  const html = renderLogin();

  assert.match(html, /<form[^>]*aria-label="Admin login"[^>]*aria-busy="false"/);
  assert.match(
    html,
    /<div class="creator-auth-label"><label for="admin-login-email"><span>Email<\/span><\/label>/
  );
  assert.match(
    html,
    /<input[^>]*id="admin-login-email"[^>]*type="email"[^>]*required=""[^>]*placeholder="admin@company\.com"[^>]*autoComplete="username"/
  );
  assert.match(
    html,
    /<div class="creator-auth-label"><label for="admin-login-password"><span>Password<\/span><\/label>/
  );
  assert.match(
    html,
    /<input[^>]*id="admin-login-password"[^>]*type="password"[^>]*required=""[^>]*placeholder="••••••••"[^>]*autoComplete="current-password"/
  );
  assert.match(html, /<button type="button" class="creator-auth-eye" aria-label="Show password"/);
  assert.match(loginSource, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(
    loginSource,
    /\{showPassword \? \([\s\S]*?<EyeOff[^>]*aria-hidden="true"[\s\S]*?\) : \([\s\S]*?<Eye[^>]*aria-hidden="true"/
  );
});

test("Admin login preserves request/session flow and provides safe loading and error states", () => {
  assert.match(loginSource, /fetch\(`\$\{apiBaseUrl\(\)\}\/auth\/login`/);
  assert.match(loginSource, /JSON\.stringify\(\{ email, password \}\)/);
  assert.match(loginSource, /nativeLogin\(email\.trim\(\), password\)/);
  assert.match(
    loginSource,
    /saveAdminSession\(\{ token: result\.token, expiresAt: result\.expiresAt \}\)/
  );
  assert.match(loginSource, /saveAdminSession[\s\S]*onLoggedIn\(\)/);
  assert.match(loginSource, /if \(isSubmitting\) return/);
  assert.match(loginSource, /aria-busy=\{isSubmitting\}/);
  assert.match(loginSource, /disabled=\{isSubmitting\}/);
  assert.match(loginSource, /Signing in…/);
  assert.match(loginSource, /setErrorMessage\(undefined\)[\s\S]*nativeLogin/);
  assert.match(loginSource, /id="admin-login-error"/);
  assert.match(loginSource, /role="alert"/);
  assert.match(loginSource, /<AlertCircle[^>]*aria-hidden="true"/);
  assert.match(loginSource, /setErrorMessage\("Invalid email or password"\)/);
  assert.doesNotMatch(loginSource, /aria-live=/);
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
  assert.match(uiStyles, /\.creator-auth-eye:focus-visible/);
  assert.match(uiStyles, /\.creator-auth-submit:focus-visible/);
  assert.match(
    uiStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.creator-auth-submit:hover:not\(:disabled\)[\s\S]*?transform: none;/s
  );
});
