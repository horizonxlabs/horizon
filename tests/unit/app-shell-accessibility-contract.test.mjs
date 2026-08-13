import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../packages/ui/src/app-shell.tsx";

globalThis.React = React;

const source = await readFile(
  new URL("../../packages/ui/src/app-shell.tsx", import.meta.url),
  "utf8"
);

const shellProps = {
  title: "Horizon",
  navItems: [{ label: "Projects", route: "/creator/", icon: "workspace" }],
  userName: "Creator User"
};

test("AppShell instances pair mobile triggers with unique sidebar IDs", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(AppShell, shellProps, "First"),
      React.createElement(AppShell, shellProps, "Second")
    )
  );
  const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
  const ids = [...html.matchAll(/<aside id="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(controls.length, 2);
  assert.deepEqual(controls, ids);
  assert.equal(new Set(ids).size, 2);
});

test("AppShell gates mobile hiding and manages drawer keyboard focus", () => {
  assert.match(source, /matchMedia\(["']\(max-width: 760px\)["']\)/);
  assert.match(source, /isMobileViewport\s*&&\s*!isMobileMenuOpen/);
  assert.match(source, /inert=/);
  assert.match(source, /aria-hidden=/);
  assert.match(source, /addEventListener\(["']keydown["']/);
  assert.match(source, /event\.key\s*===\s*["']Escape["']/);
  assert.match(source, /closeControlRef\.current\?\.focus\(\)/);
  assert.match(source, /mobileTriggerRef\.current\?\.focus\(\)/);
});

test("AppShell marks the active navigation link as the current page", () => {
  assert.match(source, /aria-current=\{isActive \? "page" : undefined\}/);
});

test("AppShell resolves the active navigation item from currentPath", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        ...shellProps,
        currentPath: "/creator/projects",
        navItems: [
          { label: "Home", route: "/creator", icon: "workspace" },
          { label: "Projects", route: "/creator/projects", icon: "workspace" }
        ]
      },
      "Content"
    )
  );

  assert.match(html, /href="\/creator\/projects"[^>]*aria-current="page"/);
});

test("AppShell renders project context between the brand and primary navigation", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        ...shellProps,
        sidebarContext: React.createElement(
          "button",
          { type: "button", "aria-label": "Switch project" },
          "Project One"
        )
      },
      "Content"
    )
  );

  const contextPosition = html.indexOf('aria-label="Switch project"');
  const navigationPosition = html.indexOf('aria-label="Primary"');

  assert.ok(contextPosition >= 0, "the sidebar project context should render");
  assert.ok(
    contextPosition < navigationPosition,
    "project context should appear before primary navigation"
  );
});

test("usePageHeadingFocus focuses the main page heading after navigation", async () => {
  const source = await readFile(
    new URL("../../packages/ui/src/browser-navigation.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /document\.querySelector<HTMLElement>\("main h1"\)/);
  assert.match(source, /heading\.focus\(\)/);
});
