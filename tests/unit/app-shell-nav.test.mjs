import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { AppShell, isPlainLeftClick } from "../../packages/ui/src/app-shell.tsx";

test("isPlainLeftClick accepts a plain left click", () => {
  assert.equal(
    isPlainLeftClick({
      button: 0,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false
    }),
    true
  );
});

test("isPlainLeftClick rejects modified / non-left / prevented clicks", () => {
  for (const mod of [
    { button: 1 },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { defaultPrevented: true }
  ]) {
    assert.equal(
      isPlainLeftClick({
        button: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        ...mod
      }),
      false
    );
  }
});

test("AppShell still renders nav items as anchors with href (a11y / fallback preserved)", () => {
  const html = renderToStaticMarkup(
    h(
      AppShell,
      {
        title: "T",
        userName: "U",
        navItems: [{ label: "Home", route: "/admin", icon: "dashboard" }]
      },
      h("div", null, "x")
    )
  );
  assert.match(html, /href="\/admin"/);
});
