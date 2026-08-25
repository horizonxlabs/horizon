import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement as h } from "react";
import { Tabs } from "../../packages/ui/src/index.tsx";

globalThis.React = React;

function render(active, variant) {
  return renderToStaticMarkup(
    h(Tabs, {
      items: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      active,
      variant,
      onSelect: () => {},
      "aria-label": "Views"
    })
  );
}

test("Tabs is RovingFocus-backed and preserves tablist structure + active styling", () => {
  const html = render("b");
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-label="Views"/);
  assert.match(html, /data-radix-collection-item/);
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /border-primary/);
});

test("Tabs renders without throwing under static rendering", () => {
  assert.doesNotThrow(() => render("a"));
});

test("Tabs supports a segmented toggle variant without changing tab semantics", () => {
  const html = render("a", "segmented");
  assert.match(html, /rounded-xl/);
  assert.match(html, /bg-primary-soft/);
  assert.match(html, /bg-transparent text-muted/);
  assert.match(html, /role="tablist"/);
});
