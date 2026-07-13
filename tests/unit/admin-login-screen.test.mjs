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
const { AdminLoginScreen, authenticateAdmin, nativeLogin } =
  await import("../../apps/admin-web/src/login-screen.tsx");

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
  assert.match(loginSource, /fetch\(`\$\{baseUrl\}\/auth\/login`/);
  assert.match(loginSource, /JSON\.stringify\(\{ email, password \}\)/);
  assert.match(loginSource, /authenticateAdmin\(email, password, onLoggedIn\)/);
  assert.match(loginSource, /if \(isSubmitting\) return/);
  assert.match(loginSource, /aria-busy=\{isSubmitting\}/);
  assert.match(loginSource, /disabled=\{isSubmitting\}/);
  assert.match(loginSource, /Signing in…/);
  assert.match(loginSource, /setErrorMessage\(undefined\)[\s\S]*authenticateAdmin/);
  assert.match(loginSource, /id="admin-login-error"/);
  assert.match(loginSource, /role="alert"/);
  assert.match(loginSource, /<AlertCircle[^>]*aria-hidden="true"/);
  assert.match(loginSource, /setErrorMessage\("Invalid email or password"\)/);
  assert.doesNotMatch(loginSource, /aria-live=/);
});

test("Admin sidebar retains only the accessible logout action", () => {
  assert.match(
    adminSource,
    /session=\{<button type="button" className="secondary-button" onClick=\{\(\) => \{ clearAdminSession\(\); setSessionActive\(false\); \}\}><LockKeyhole[^>]*\/>Logout<\/button>\}/
  );
  assert.doesNotMatch(adminSource, /Refresh Session/);
  assert.doesNotMatch(adminSource, /handleSignInBridge/);
});

test("nativeLogin keeps the POST contract and rejects non-OK or malformed responses", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              token: "admin-token",
              expiresAt: "2026-07-14T00:00:00.000Z",
              mustChangePassword: false
            }
          };
        }
      };
    };

    const result = await nativeLogin(
      "admin@company.com",
      "unchanged-password",
      "https://platform.example/api"
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://platform.example/api/auth/login");
    assert.deepEqual(requests[0].options, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@company.com",
        password: "unchanged-password"
      })
    });
    assert.deepEqual(result, {
      token: "admin-token",
      expiresAt: "2026-07-14T00:00:00.000Z",
      mustChangePassword: false
    });

    for (const response of [
      { ok: true, json: async () => ({ ok: true, data: {} }) },
      {
        ok: false,
        json: async () => ({
          ok: true,
          data: {
            token: "must-not-be-accepted",
            expiresAt: "2026-07-14T00:00:00.000Z"
          }
        })
      },
      { ok: true, json: async () => null }
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(
        () => nativeLogin("admin@company.com", "password", "https://platform.example/api"),
        /Invalid email or password/
      );
    }

    globalThis.fetch = async () => {
      throw new Error("network details stay internal to the submit handler");
    };
    await assert.rejects(() =>
      nativeLogin("admin@company.com", "password", "https://platform.example/api")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticateAdmin trims email and persists before notifying success", async () => {
  const events = [];

  await authenticateAdmin(
    " admin@company.com ",
    " unchanged-password ",
    () => events.push("logged-in"),
    {
      login: async (email, password) => {
        events.push(`login:${email}:${password}`);
        return {
          token: "admin-token",
          expiresAt: "2026-07-14T00:00:00.000Z",
          mustChangePassword: false
        };
      },
      saveSession: (session) => events.push(`save:${session.token}:${session.expiresAt}`)
    }
  );

  assert.deepEqual(events, [
    "login:admin@company.com: unchanged-password ",
    "save:admin-token:2026-07-14T00:00:00.000Z",
    "logged-in"
  ]);

  await assert.rejects(() =>
    authenticateAdmin("admin@company.com", "password", () => events.push("unexpected"), {
      login: async () => {
        throw new Error("invalid credentials");
      },
      saveSession: () => events.push("unexpected-save")
    })
  );
  assert.doesNotMatch(events.join("\n"), /unexpected/);
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
