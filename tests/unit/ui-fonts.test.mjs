import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const fonts = readFileSync("packages/ui/fonts.css", "utf8");
const theme = readFileSync("packages/ui/theme.css", "utf8");

test("every bundled font file is actually declared with @font-face", () => {
  const files = readdirSync("packages/ui/fonts").filter((f) => f.endsWith(".woff2"));
  assert.ok(files.length > 0, "no bundled fonts found");
  for (const file of files) {
    assert.ok(fonts.includes(file), `${file} is bundled but never declared in fonts.css`);
  }
});

test("declared faces use woff2 and swap display", () => {
  const faces = fonts.match(/@font-face/g) ?? [];
  assert.equal(faces.length, readdirSync("packages/ui/fonts").filter((f) => f.endsWith(".woff2")).length);
  assert.ok(fonts.includes("font-display: swap"), "faces must not block first paint");
});

test("the sans stack resolves Latin before Thai", () => {
  const stack = theme.match(/--evcp-font-sans:\s*([^;]+);/)?.[1] ?? "";
  const latin = stack.indexOf("--evcp-font-latin");
  const thai = stack.indexOf("--evcp-font-thai");
  assert.ok(latin !== -1 && thai !== -1, "both stacks must be referenced");
  assert.ok(
    latin < thai,
    "Latin must come first: font fallback is per-glyph, so a Thai-first stack renders English text from a Thai face"
  );
});

test("the landing app ships the real logo, not a text wordmark", () => {
  const nav = readFileSync("apps/landing-web/src/shared/site-nav.tsx", "utf8");
  assert.match(nav, /horizon-logo\.png/);
  assert.match(nav, /alt=/, "the logo must carry alt text");
});
