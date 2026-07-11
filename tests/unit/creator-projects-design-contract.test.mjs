import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../../packages/ui/styles.css", import.meta.url), "utf8");

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

test("creator project status uses neutral shared tokens", () => {
  const statusRule = css.match(/\.hz-project-status\s*\{(?<declarations>[^}]*)\}/)?.groups
    ?.declarations;

  assert.ok(statusRule, "missing .hz-project-status declaration block");
  assert.match(statusRule, /background:\s*var\(--evcp-color-surface-muted\)/);
  assert.match(statusRule, /border:\s*1px solid var\(--evcp-color-border\)/);
  assert.match(statusRule, /color:\s*var\(--evcp-color-muted\)/);
  assert.doesNotMatch(statusRule, /--evcp-color-(?:success|warning|danger)/);
});
