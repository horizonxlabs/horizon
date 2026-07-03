import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("shared UI package exposes production design system primitives", () => {
  const uiSource = readFileSync("packages/ui/src/index.tsx", "utf8");

  for (const exportName of [
    "AppShell",
    "PageHeader",
    "ToneBadge",
    "MetricCard",
    "SectionCard",
    "DataTable",
    "DefinitionGrid",
    "DecisionPanel",
    "WorkflowRail",
    "ServiceStrip"
  ]) {
    assert.match(uiSource, new RegExp(`export function ${exportName}\\b`));
  }
});

test("design system uses EVCP tokens instead of page-only hardcoded styling", () => {
  const css = readFileSync("packages/ui/styles.css", "utf8");

  for (const token of [
    "--evcp-color-primary",
    "--evcp-color-surface",
    "--evcp-space-4",
    "--evcp-radius-card",
    "--evcp-shadow-card"
  ]) {
    assert.match(css, new RegExp(token));
  }

  assert.match(css, /\.ds-page-header/);
  assert.match(css, /\.ds-data-table/);
  assert.match(css, /\.ds-section-card/);
});

test("admin governance screen consumes shared design system components", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(adminSource, /from "@evcp\/ui"/);
  for (const component of ["PageHeader", "MetricCard", "SectionCard", "DataTable", "DecisionPanel", "WorkflowRail", "ServiceStrip"]) {
    assert.match(adminSource, new RegExp(`\\b${component}\\b`));
    assert.doesNotMatch(adminSource, new RegExp(`function ${component}\\b`));
  }
});
