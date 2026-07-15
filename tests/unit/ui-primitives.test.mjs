import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../packages/ui/src/primitives/button.tsx";

test("Button defaults to the primary variant", () => {
  const html = renderToStaticMarkup(h(Button, null, "บันทึก"));
  assert.match(html, /bg-primary/);
  assert.match(html, /บันทึก/);
});

test("Button danger variant applies danger utilities", () => {
  const html = renderToStaticMarkup(h(Button, { variant: "danger" }, "ลบ"));
  assert.match(html, /bg-danger-strong/);
});

test("Button forwards native button attributes", () => {
  const html = renderToStaticMarkup(h(Button, { type: "submit", disabled: true }, "OK"));
  assert.match(html, /type="submit"/);
  assert.match(html, /disabled/);
});
