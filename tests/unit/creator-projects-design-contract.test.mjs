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
