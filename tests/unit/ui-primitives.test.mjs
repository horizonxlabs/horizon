import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../packages/ui/src/primitives/button.tsx";
import { Card, SectionCard } from "../../packages/ui/src/primitives/card.tsx";
import { Badge, StatusPill, ToneBadge } from "../../packages/ui/src/primitives/badge.tsx";
import { Field, Input, Select } from "../../packages/ui/src/primitives/input.tsx";

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

test("SectionCard supports legacy eyebrow and action props", () => {
  const html = renderToStaticMarkup(
    h(SectionCard, { eyebrow: "หมวด", title: "หัวข้อ", action: h("button", null, "ปุ่ม") }, "เนื้อหา")
  );
  assert.match(html, /หมวด/);
  assert.match(html, /หัวข้อ/);
  assert.match(html, /ปุ่ม/);
  assert.match(html, /เนื้อหา/);
});

test("Badge success tone uses success utilities", () => {
  const html = renderToStaticMarkup(h(Badge, { tone: "success" }, "อนุมัติ"));
  assert.match(html, /bg-success-bg/);
  assert.match(html, /text-success/);
});

test("StatusPill maps healthy to success styling", () => {
  const html = renderToStaticMarkup(h(StatusPill, { status: "healthy" }));
  assert.match(html, /bg-success-bg/);
});

test("ToneBadge defaults to neutral", () => {
  const html = renderToStaticMarkup(h(ToneBadge, null, "ป้าย"));
  assert.match(html, /ป้าย/);
});

test("Input renders a bordered control and forwards props", () => {
  const html = renderToStaticMarkup(h(Input, { placeholder: "ชื่อแอป", name: "appName" }));
  assert.match(html, /border-border/);
  assert.match(html, /placeholder="ชื่อแอป"/);
  assert.match(html, /name="appName"/);
});

test("Field renders label bound to control", () => {
  const html = renderToStaticMarkup(
    h(Field, { label: "อีเมล", htmlFor: "email" }, h(Input, { id: "email" }))
  );
  assert.match(html, /อีเมล/);
  assert.match(html, /for="email"/);
});

test("Select renders a bordered control and forwards props", () => {
  const html = renderToStaticMarkup(
    h(Select, { name: "role" }, h("option", { value: "admin" }, "ผู้ดูแลระบบ"))
  );
  assert.match(html, /border-border/);
  assert.match(html, /name="role"/);
  assert.match(html, /ผู้ดูแลระบบ/);
});
