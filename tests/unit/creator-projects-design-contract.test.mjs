import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../../packages/ui/styles.css", import.meta.url), "utf8");

function declarationBlock(selector, source = css) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector}\\s*\\{(?<declarations>[^}]*)\\}`))?.groups
    ?.declarations;
}

function mediaBlock(query) {
  const start = css.indexOf(`@media (${query})`);
  assert.notEqual(start, -1, `missing media query: ${query}`);
  const next = css.indexOf("@media (", start + 1);
  return css.slice(start, next === -1 ? undefined : next);
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

  const reducedMotion = mediaBlock("prefers-reduced-motion: reduce");
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
