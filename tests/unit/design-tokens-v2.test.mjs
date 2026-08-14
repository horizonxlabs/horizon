import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { loadGoldenTemplate } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/template.ts"
);

function templateFile(template, path) {
  return template.files.find((file) => file.path === path);
}

test("template vendors Anuphan + JetBrains Mono via fontsource (offline-safe)", () => {
  const template = loadGoldenTemplate();
  const pkg = JSON.parse(templateFile(template, "package.json").content);
  assert.ok(pkg.dependencies["@fontsource-variable/anuphan"]);
  assert.ok(pkg.dependencies["@fontsource-variable/jetbrains-mono"]);
  const layout = templateFile(template, "app/layout.tsx").content;
  assert.match(layout, /@fontsource-variable\/anuphan/);
  assert.match(layout, /@fontsource-variable\/jetbrains-mono/);
});

test("token v2: Anuphan-first sans, mono stack, and semantic status colors", () => {
  const template = loadGoldenTemplate();
  const globals = templateFile(template, "app/globals.css").content;
  assert.match(globals, /--font-sans:\s*\n?\s*"Anuphan Variable"/);
  assert.match(globals, /--font-mono:[\s\S]*JetBrains Mono Variable/);
  for (const tone of ["success", "warning", "danger", "info"]) {
    assert.match(globals, new RegExp(`--color-${tone}-600`), `missing ${tone} scale`);
  }
  // dark surfaces stay first-class: deep neutral tokens exist for dashboard use
  assert.match(globals, /--color-surface-dark/);
});

test("kit gains the enterprise dashboard set", () => {
  const template = loadGoldenTemplate();
  for (const name of ["stat-card", "empty-state", "skeleton", "page-header", "app-shell"]) {
    assert.ok(templateFile(template, `components/ui/${name}.tsx`), `missing ${name}`);
  }
  // the shell manages a mobile drawer, so it must be a client component
  assert.match(templateFile(template, "components/ui/app-shell.tsx").content, /^"use client";/);
  // stat card renders deltas with tabular numerals for finance-grade alignment
  assert.match(templateFile(template, "components/ui/stat-card.tsx").content, /tabular-nums/);
});

test("prompt advertises the new components and the mono-for-numbers rule", () => {
  const prompt = buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
  for (const name of ["StatCard", "EmptyState", "Skeleton", "PageHeader", "AppShell"]) {
    assert.match(prompt, new RegExp(name), `prompt missing ${name}`);
  }
  assert.match(prompt, /font-mono/);
  assert.match(prompt, /Anuphan/);
});
