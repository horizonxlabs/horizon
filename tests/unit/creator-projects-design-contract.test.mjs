import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../../packages/ui/styles.css", import.meta.url), "utf8");

function declarationBlock(selector, source = css) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector}\\s*\\{(?<declarations>[^}]*)\\}`))?.groups
    ?.declarations;
}

function mediaBlock(query, requiredSelector) {
  let start = -1;
  while ((start = css.indexOf(`@media (${query})`, start + 1)) !== -1) {
    const next = css.indexOf("@media (", start + 1);
    const block = css.slice(start, next === -1 ? undefined : next);
    if (!requiredSelector || block.includes(requiredSelector)) return block;
  }
  assert.fail(
    `missing media query: ${query}${requiredSelector ? ` containing ${requiredSelector}` : ""}`
  );
}

test("creator projects B1 styles cover studio, status, focus, and responsive layouts", () => {
  for (const selector of [
    ".hz-projects-studio",
    ".hz-project-status",
    ".hz-card:focus-visible",
    ".hz-prompt-cta:disabled"
  ]) {
    assert.ok(css.includes(selector), `missing shared selector: ${selector}`);
  }
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("creator projects interactive states have concrete shared declarations", () => {
  const cardFocus = declarationBlock(".hz-card:focus-visible");
  assert.ok(cardFocus, "missing card focus-visible declaration block");
  assert.match(cardFocus, /border-color:\s*var\(--evcp-color-primary\)/);
  assert.match(cardFocus, /box-shadow:\s*0 0 0 3px var\(--evcp-color-primary-soft\)/);

  const activeCardFocus = declarationBlock(".hz-card.active:focus-visible");
  assert.ok(activeCardFocus, "missing active card focus-visible declaration block");
  assert.match(activeCardFocus, /outline:\s*\d+px solid var\(--evcp-color-primary\)/);
  assert.match(activeCardFocus, /outline-offset:\s*\d+px/);

  const disabledCta = declarationBlock(".hz-prompt-cta:disabled");
  assert.ok(disabledCta, "missing disabled prompt CTA declaration block");
  assert.match(disabledCta, /cursor:\s*not-allowed/);
  assert.match(disabledCta, /opacity:\s*0\.55/);
});

test("creator projects grid and motion contracts have concrete declarations", () => {
  const tabletGrid = declarationBlock(".hz-grid", mediaBlock("max-width: 900px"));
  assert.match(tabletGrid, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);

  const mobileGrid = declarationBlock(".hz-grid", mediaBlock("max-width: 640px"));
  assert.match(mobileGrid, /grid-template-columns:\s*minmax\(0, 1fr\)/);

  const reducedMotion = mediaBlock("prefers-reduced-motion: reduce", ".hz-card:hover");
  assert.match(reducedMotion, /transition:\s*none/);
  assert.match(declarationBlock(".hz-card:hover", reducedMotion), /transform:\s*none/);
  assert.match(declarationBlock(".hz-spinner", reducedMotion), /animation:\s*none !important/);
});

test("creator project status uses neutral shared tokens", () => {
  const statusRule = declarationBlock(".hz-project-status");

  assert.ok(statusRule, "missing .hz-project-status declaration block");
  assert.match(statusRule, /background:\s*var\(--evcp-color-surface-muted\)/);
  assert.match(statusRule, /border:\s*1px solid var\(--evcp-color-border\)/);
  assert.match(statusRule, /color:\s*var\(--evcp-color-muted\)/);
  assert.doesNotMatch(statusRule, /--evcp-color-(?:success|warning|danger)/);
});

test("creator light sidebar variant has concrete shared declarations", () => {
  const sidebar = declarationBlock(".app-shell-light .sidebar");
  assert.match(sidebar, /background:\s*var\(--evcp-color-surface/);
  assert.match(sidebar, /border-right:\s*1px solid var\(--evcp-color-border/);

  const nav = declarationBlock(".app-shell-light .sidebar-nav a");
  assert.match(nav, /color:\s*var\(--evcp-color-muted/);

  const active = declarationBlock(".app-shell-light .sidebar-nav a.active");
  assert.match(active, /background:\s*var\(--evcp-color-primary-soft/);
  assert.match(active, /color:\s*var\(--evcp-color-primary-strong/);

  for (const selector of [
    ".app-shell-light .sidebar-title strong",
    ".app-shell-light .sidebar-toggle",
    ".app-shell-light .sidebar-footer strong",
    ".app-shell-light .sidebar-user-meta span"
  ]) {
    assert.ok(declarationBlock(selector), `missing light sidebar declaration: ${selector}`);
  }
});

test("shared shell has a concrete mobile off-canvas drawer contract", () => {
  for (const selector of [
    ".app-shell-mobile-trigger",
    ".app-shell-mobile-backdrop",
    ".sidebar-mobile-close"
  ]) {
    assert.ok(declarationBlock(selector), `missing mobile drawer declaration: ${selector}`);
  }

  const mobile = mediaBlock("max-width: 760px");
  const sidebar = declarationBlock(".sidebar", mobile);
  assert.match(sidebar, /position:\s*fixed/);
  assert.match(sidebar, /transform:\s*translateX\(-100%\)/);

  const openSidebar = declarationBlock(".app-shell-mobile-open .sidebar", mobile);
  assert.match(openSidebar, /transform:\s*translateX\(0\)/);

  const openBackdrop = declarationBlock(
    ".app-shell-mobile-open .app-shell-mobile-backdrop",
    mobile
  );
  assert.match(openBackdrop, /display:\s*block/);
});
