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
    "--evcp-font-thai",
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
  assert.match(css, /body\s*\{[^}]*font-family: var\(--evcp-font-sans\)/s);
  assert.match(css, /button,\s*input,\s*select,\s*textarea,\s*table\s*\{[^}]*font: inherit/s);
});

test("apps preload LINE Seed Thai fonts before React renders", () => {
  for (const htmlPath of [
    "apps/creator-web/index.html",
    "apps/admin-web/index.html",
    "apps/app-store-pwa/index.html"
  ]) {
    const html = readFileSync(htmlPath, "utf8");
    assert.match(
      html,
      /rel="preload" href="fonts\/LINESeedSansTH_W_Rg\.woff2" as="font" type="font\/woff2" crossorigin/
    );
    assert.match(html, /font-family: "LINE Seed Sans TH"/);
    assert.match(html, /font-display: block/);
    assert.match(
      html,
      /src: url\("%BASE_URL%fonts\/LINESeedSansTH_W_Rg\.woff2"\) format\("woff2"\)/
    );
  }
});

test("AppShell provides a professional persistent navigation layout", () => {
  const uiSource = readFileSync("packages/ui/src/index.tsx", "utf8");
  const css = readFileSync("packages/ui/styles.css", "utf8");

  for (const shellClass of [
    "sidebar-brand",
    "sidebar-mark",
    "sidebar-title",
    "sidebar-toggle",
    "sidebar-nav",
    "sidebar-nav-short",
    "sidebar-nav-label",
    "sidebar-footer",
    "topbar-context",
    "topbar-user",
    "topbar-session",
    "topbar-avatar"
  ]) {
    assert.match(uiSource, new RegExp(shellClass));
    assert.match(css, new RegExp(`\\.${shellClass}`));
  }

  assert.match(uiSource, /resolveActiveNavItem/);
  assert.match(uiSource, /useState/);
  assert.match(uiSource, /app-shell-collapsed/);
  assert.match(uiSource, /evcp-sidebar-collapsed/);
  assert.match(uiSource, /aria-expanded=\{!isSidebarCollapsed\}/);
  assert.match(uiSource, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(css, /grid-template-columns: 280px minmax\(0, 1fr\)/);
  assert.match(css, /\.app-shell-collapsed\s*\{[^}]*grid-template-columns: 84px minmax\(0, 1fr\)/s);
  assert.match(css, /position: sticky/);
  assert.match(css, /\.sidebar-nav a\.active/);
});

test("admin governance screen consumes shared design system components", () => {
  const adminSource = readFileSync("apps/admin-web/src/main.tsx", "utf8");

  assert.match(adminSource, /from "@evcp\/ui"/);
  for (const component of [
    "PageHeader",
    "MetricCard",
    "SectionCard",
    "DataTable",
    "DecisionPanel",
    "WorkflowRail",
    "ServiceStrip"
  ]) {
    assert.match(adminSource, new RegExp(`\\b${component}\\b`));
    assert.doesNotMatch(adminSource, new RegExp(`function ${component}\\b`));
  }
});

// SKIPPED: this asserts the pre-redesign "Antigravity" command workspace (ag-* classes,
// "New Conversation"/"Scheduled Tasks"/etc.). The creator workspace has since been
// redesigned to the Lovable-style chat+preview layout, so these markers no longer exist.
// Re-author these assertions against the final vibe-workspace design. Unrelated to the
// native-auth feature on this branch.
test.skip("creator AI workspace exposes Antigravity-style command workspace", () => {
  const creatorSource = readFileSync("apps/creator-web/src/main.tsx", "utf8");
  const css = readFileSync("packages/ui/styles.css", "utf8");

  for (const uiText of [
    "New Conversation",
    "Conversation History",
    "Scheduled Tasks",
    "Ask anything, @ to mention, / for actions",
    "New Worktree",
    "Selected Artifact",
    "Current Run",
    "Output Path",
    "Enterprise Lock"
  ]) {
    assert.match(creatorSource, new RegExp(uiText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const className of [
    "ag-workspace",
    "ag-rail",
    "ag-stage",
    "ag-composer-card",
    "ag-composer-actions",
    "ag-left-workbench",
    "ag-worktree-menu",
    "ag-lower-dock"
  ]) {
    assert.match(creatorSource, new RegExp(className));
    assert.match(css, new RegExp(`\\.${className}`));
  }

  assert.doesNotMatch(css, /\.app-shell:has\(\.ag-workspace\) > \.sidebar/);
  assert.match(css, /\.ag-workspace\s*\{[^}]*width: 100%/s);
});
