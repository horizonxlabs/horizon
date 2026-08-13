import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../packages/ui/src/app-shell.tsx";

globalThis.React = React;

const { HorizonLogo } = await import("../../apps/admin-web/src/shared/HorizonLogo.tsx");

test("Admin sidebar logo swaps the full lockup for an icon-only mark when collapsed", () => {
  const html = renderToStaticMarkup(React.createElement(HorizonLogo));

  assert.match(html, /horizon-logo-full/);
  assert.match(html, /horizon-logo-icon/);
  assert.equal((html.match(/<img[^>]+horizon-mark\.png/g) ?? []).length, 2);
  assert.match(html, /horizon-logo-icon[^>]*role="img"[^>]*aria-hidden="true"/);
});

test("collapsed AppShell exposes the state class that switches the Admin logo to its mark", (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: { getItem: (key) => (key === "evcp-sidebar-collapsed" ? "true" : null) }
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const html = renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        title: "Horizon Admin",
        logo: React.createElement(HorizonLogo),
        navItems: [{ label: "Dashboard", route: "/admin", icon: "dashboard" }],
        currentPath: "/admin",
        userName: "Platform Admin"
      },
      "Admin content"
    )
  );

  assert.match(html, /<div class="[^"]*app-shell-collapsed/);
  assert.match(html, /horizon-logo-full/);
  assert.match(html, /horizon-logo-icon/);
});
