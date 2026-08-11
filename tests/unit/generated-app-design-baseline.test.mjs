import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../templates/nextjs-base");
const read = (path) => readFileSync(resolve(templateRoot, path), "utf8");

function buildPrompt() {
  const template = { name: "nextjs-base", lockedFiles: [], files: [] };
  return buildSystemPrompt({ template, contextFiles: [], rollingSummary: null });
}

test("system prompt demands beautiful-by-default design with Tailwind", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /## Design quality/);
  assert.match(prompt, /Tailwind/);
  // typography, spacing, and color rules are the load-bearing guidance
  assert.match(prompt, /hierarchy/i);
  assert.match(prompt, /whitespace|spacing/i);
  assert.match(prompt, /hover|focus/i);
  // the old directive that produced unstyled output is gone
  assert.doesNotMatch(prompt, /Prefer inline styles/);
});

test("system prompt allows splitting large builds into components", () => {
  const prompt = buildPrompt();
  assert.match(prompt, /components\//);
});

test("template wires Tailwind 4 with design tokens", () => {
  const globals = read("app/globals.css");
  assert.match(globals, /@import "tailwindcss"/);
  assert.match(globals, /@theme/);
  assert.match(globals, /--color-brand/);
  assert.match(globals, /--font-sans/);

  assert.ok(existsSync(resolve(templateRoot, "postcss.config.mjs")));
  assert.match(read("postcss.config.mjs"), /@tailwindcss\/postcss/);

  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.devDependencies["@tailwindcss/postcss"]);
  assert.ok(pkg.devDependencies.tailwindcss);
});

test("starter page is styled with Tailwind instead of CSS modules", () => {
  const page = read("app/page.tsx");
  assert.doesNotMatch(page, /page\.module\.css/);
  assert.match(page, /className=/);
  assert.equal(existsSync(resolve(templateRoot, "app/page.module.css")), false);

  const layout = read("app/layout.tsx");
  assert.match(layout, /antialiased/);
});
