import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Textarea } from "../../packages/ui/src/index.tsx";

test("Textarea renders a textarea with the shared control tokens and forwards props", () => {
  const html = renderToStaticMarkup(
    React.createElement(Textarea, { value: "hi", onChange: () => {}, rows: 4, "aria-label": "notes" })
  );
  assert.match(html, /<textarea/);
  assert.match(html, /aria-label="notes"/);
  assert.match(html, /rows="4"/);
  assert.match(html, /border-border/);
  assert.match(html, /focus:ring-primary-soft/);
});
