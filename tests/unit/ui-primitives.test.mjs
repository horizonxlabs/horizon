import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../packages/ui/src/primitives/button.tsx";
import { Card, SectionCard } from "../../packages/ui/src/primitives/card.tsx";

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

test("Card renders a bordered surface", () => {
  const html = renderToStaticMarkup(h(Card, null, "เนื้อหา"));
  assert.match(html, /bg-surface/);
  assert.match(html, /border-border/);
  assert.match(html, /rounded-card/);
});

test("SectionCard renders its title and actions", () => {
  const html = renderToStaticMarkup(
    h(SectionCard, { title: "หัวข้อ", actions: h("span", null, "ปุ่ม") }, "ตาราง")
  );
  assert.match(html, /หัวข้อ/);
  assert.match(html, /ปุ่ม/);
  assert.match(html, /ตาราง/);
});
