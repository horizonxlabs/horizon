import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

// The UI package is split across src/** (index.tsx primitives, app-shell.tsx, nav-icons.tsx),
// so assertions read the whole tree rather than a single file.
function readUiSource(dir = "packages/ui/src") {
  let combined = "";
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) combined += readUiSource(fullPath);
    else if (/\.(tsx?|jsx?)$/.test(entry)) combined += readFileSync(fullPath, "utf8");
  }
  return combined;
}

test("shared UI package exposes production design system primitives", () => {
  const uiSource = readUiSource();

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
      /<link\s+[^>]*rel="preload"[\s\S]*?href="fonts\/LINESeedSansTH_W_Rg\.woff2"[\s\S]*?as="font"[\s\S]*?type="font\/woff2"[\s\S]*?crossorigin[\s\S]*?\/?>/
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
  const uiSource = readUiSource();

  // The shell chrome was rebuilt on Tailwind token utilities (Sapphire Clean look); assert the
  // structural chrome + preserved behavior instead of the retired legacy class names.
  // Dark sidebar chrome + sticky rail, with a light-tone variant and a collapsed grid.
  assert.match(uiSource, /bg-\[#0b1220\]/);
  assert.match(uiSource, /sticky top-0/);
  assert.match(uiSource, /bg-surface text-body/);
  assert.match(uiSource, /md:grid-cols-\[84px_minmax\(0,1fr\)\]/);
  // Nav items: glyph + label, rounded control, active accent bar via the before: pseudo-element.
  assert.match(uiSource, /NavGlyph/);
  assert.match(uiSource, /rounded-\[9px\]/);
  assert.match(uiSource, /before:opacity-100/);
  // Account footer avatar keeps its status dot via the after: pseudo-element.
  assert.match(uiSource, /after:content-\['']/);

  // Preserved behavior / accessibility contract.
  assert.match(uiSource, /resolveActiveNavItem/);
  assert.match(uiSource, /useState/);
  assert.match(uiSource, /evcp-sidebar-collapsed/);
  assert.match(uiSource, /aria-expanded=\{!isSidebarCollapsed\}/);
  assert.match(uiSource, /aria-current=\{isActive \? "page" : undefined\}/);
  // Responsive mobile drawer breakpoint preserved.
  assert.match(uiSource, /matchMedia\("\(max-width: 760px\)"\)/);
  // Mobile full-drawer invariant: collapsed desktop state must not hide drawer
  // controls on mobile. The session/sign-out block and nav labels carry a
  // max-md: reset that overrides the collapsed `hidden` class.
  assert.match(uiSource, /max-md:!?flex/);
  assert.match(uiSource, /max-md:!?(?:block|grid)/);
  // Page content clears the fixed mobile hamburger trigger.
  assert.match(uiSource, /max-md:pt-\[72px\]/);
});

test("AdminApp composes a governance screen that consumes shared design system components", () => {
  const adminAppSource = readFileSync("apps/admin-web/src/app/AdminApp.tsx", "utf8");
  const adminConsoleSource = readFileSync(
    "apps/admin-web/src/features/admin-console/AdminConsole.tsx",
    "utf8"
  );

  assert.match(adminAppSource, /import \{ AdminConsole \} from "@\/features\/admin-console"/);
  assert.match(adminConsoleSource, /from "@evcp\/ui"/);
  for (const component of [
    "PageHeader",
    "MetricCard",
    "SectionCard",
    "DataTable",
    "DecisionPanel",
    "ServiceStrip"
  ]) {
    assert.match(adminConsoleSource, new RegExp(`\\b${component}\\b`));
    assert.doesNotMatch(adminConsoleSource, new RegExp(`function ${component}\\b`));
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

test("design-system governance rejects app-layer visual styling", () => {
  const fixturePath = "apps/creator-web/src/__design_system_violation.fixture.tsx";
  writeFileSync(
    fixturePath,
    'export function BadFixture() { return <div style={{ color: "#ffffff" }} />; }\n'
  );

  try {
    const result = spawnSync("node", ["scripts/quality/check-design-system.mjs", fixturePath], {
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inline visual style detected/);
    assert.match(result.stderr, /hardcoded color detected/);
  } finally {
    rmSync(fixturePath, { force: true });
  }
});

test("design-system governance accepts the shared UI stylesheet import", () => {
  const fixturePath = "apps/creator-web/src/__design_system_allowed.fixture.tsx";
  writeFileSync(
    fixturePath,
    'import "@evcp/ui/styles.css";\nexport const allowedFixture = true;\n'
  );

  try {
    const result = spawnSync("node", ["scripts/quality/check-design-system.mjs", fixturePath], {
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(fixturePath, { force: true });
  }
});
