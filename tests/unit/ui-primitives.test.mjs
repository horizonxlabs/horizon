import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../packages/ui/src/primitives/button.tsx";
import { Card, SectionCard } from "../../packages/ui/src/primitives/card.tsx";
import { Badge, StatusPill, ToneBadge } from "../../packages/ui/src/primitives/badge.tsx";
import { Field, Input, Select } from "../../packages/ui/src/primitives/input.tsx";
import { Table, THead, TRow, TCell } from "../../packages/ui/src/primitives/table.tsx";
import { MetricCard } from "../../packages/ui/src/primitives/metric-card.tsx";
import { PageHeader } from "../../packages/ui/src/primitives/page-header.tsx";
import { AppShell } from "../../packages/ui/src/app-shell.tsx";

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
  assert.match(html, /bg-surface-muted/);
  assert.match(html, /text-muted/);
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

test("Table renders dense rows with hairline dividers", () => {
  const html = renderToStaticMarkup(
    h(Table, null, h("tbody", null, h(TRow, null, h(TCell, null, "แถว"))))
  );
  assert.match(html, /border-border/);
  assert.match(html, /แถว/);
});

test("THead renders uppercase muted header labels", () => {
  const html = renderToStaticMarkup(
    h(Table, null, h(THead, null, h(TRow, null, h(TCell, null, "หัวตาราง"))))
  );
  assert.match(html, /uppercase/);
  assert.match(html, /text-muted/);
  assert.match(html, /หัวตาราง/);
});

test("MetricCard shows label and value", () => {
  const html = renderToStaticMarkup(h(MetricCard, { label: "แอปที่ใช้งาน", value: "1,284" }));
  assert.match(html, /แอปที่ใช้งาน/);
  assert.match(html, /1,284/);
  assert.match(html, /bg-surface/);
});

test("MetricCard defaults the value to the primary tone", () => {
  const html = renderToStaticMarkup(h(MetricCard, { label: "แอป", value: "42" }));
  assert.match(html, /text-primary/);
});

test("MetricCard colors the value by tone", () => {
  const html = renderToStaticMarkup(
    h(MetricCard, { label: "สุขภาพ", value: "3", tone: "success" })
  );
  assert.match(html, /text-success/);
  assert.doesNotMatch(html, /text-primary/);
});

test("MetricCard supports legacy icon and detail props", () => {
  const html = renderToStaticMarkup(
    h(MetricCard, {
      label: "Service healthy",
      value: "3",
      detail: "from Platform API",
      icon: h("span", null, "ICON")
    })
  );
  assert.match(html, /Service healthy/);
  assert.match(html, />3</);
  assert.match(html, /from Platform API/);
  assert.match(html, /ICON/);
});

test("PageHeader renders title, description and actions", () => {
  const html = renderToStaticMarkup(
    h(PageHeader, {
      title: "ภาพรวมระบบ",
      description: "สถานะแพลตฟอร์ม",
      actions: h("button", null, "รีเฟรช")
    })
  );
  assert.match(html, /ภาพรวมระบบ/);
  assert.match(html, /สถานะแพลตฟอร์ม/);
  assert.match(html, /รีเฟรช/);
});

test("PageHeader renders eyebrow and accepts legacy tone prop", () => {
  const html = renderToStaticMarkup(
    h(PageHeader, {
      eyebrow: "หมวดหมู่",
      title: "หัวข้อ",
      tone: "surface"
    })
  );
  assert.match(html, /หมวดหมู่/);
  assert.match(html, /หัวข้อ/);
});

test("AppShell renders sidebar chrome, nav, and account with token utilities", () => {
  const html = renderToStaticMarkup(
    h(
      AppShell,
      {
        title: "Horizon",
        navItems: [
          { label: "ภาพรวม", route: "/admin", icon: "dashboard" },
          { label: "โปรเจกต์", route: "/admin/projects", icon: "projects", disabled: true }
        ],
        userName: "แอดมิน สมชาย",
        environmentLabel: "Private Server MVP",
        session: h("button", null, "ออกจากระบบ")
      },
      h("div", null, "เนื้อหา")
    )
  );
  // Brand + tagline
  assert.match(html, /Horizon/);
  // Nav labels (active + disabled branches both render)
  assert.match(html, /ภาพรวม/);
  assert.match(html, /โปรเจกต์/);
  // Active nav item is highlighted for the first matching route
  assert.match(html, /aria-current="page"/);
  // Disabled nav item stays non-interactive
  assert.match(html, /aria-disabled="true"/);
  // User + environment label + session control preserved
  assert.match(html, /แอดมิน สมชาย/);
  assert.match(html, /Private Server MVP/);
  assert.match(html, /ออกจากระบบ/);
  // Content children render inside the shell
  assert.match(html, /เนื้อหา/);
  // Sidebar uses the dark Sapphire chrome; content area uses the page token
  assert.match(html, /bg-\[#0b1220\]/);
});

test("AppShell light tone recolors the sidebar with surface tokens", () => {
  const html = renderToStaticMarkup(
    h(
      AppShell,
      {
        title: "Horizon",
        navItems: [{ label: "ภาพรวม", route: "/admin" }],
        userName: "ผู้ใช้",
        tone: "light"
      },
      h("div", null, "x")
    )
  );
  assert.match(html, /bg-surface/);
});
