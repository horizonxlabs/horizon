import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KitchenSink } from "../../packages/ui/src/kitchen-sink.tsx";

test("KitchenSink renders every primitive without throwing", () => {
  const html = renderToStaticMarkup(h(KitchenSink));
  for (const needle of ["bg-primary", "rounded-card", "bg-success-bg", "border-border"]) {
    assert.match(html, new RegExp(needle));
  }
});
