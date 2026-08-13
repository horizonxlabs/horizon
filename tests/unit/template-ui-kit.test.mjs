import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../../apps/platform-api/src/generation-loop/system-prompt.ts";

const { loadGoldenTemplate } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/template.ts"
);

const KIT = [
  "button",
  "card",
  "input",
  "label",
  "textarea",
  "select",
  "table",
  "dialog",
  "badge",
  "checkbox"
];

function templateFile(template, path) {
  return template.files.find((file) => file.path === path);
}

test("golden template ships the components/ui kit and the cn helper", () => {
  const template = loadGoldenTemplate();
  for (const name of KIT) {
    assert.ok(templateFile(template, `components/ui/${name}.tsx`), `missing components/ui/${name}.tsx`);
  }
  const utils = templateFile(template, "lib/utils.ts");
  assert.ok(utils, "missing lib/utils.ts");
  assert.match(utils.content, /twMerge\(clsx\(/);
});

test("interactive primitives are client components on Radix", () => {
  const template = loadGoldenTemplate();
  for (const name of ["dialog", "select", "checkbox"]) {
    const file = templateFile(template, `components/ui/${name}.tsx`);
    assert.match(file.content, /^"use client";/, `${name} must start with "use client"`);
    assert.match(file.content, /@radix-ui\//, `${name} must build on a Radix primitive`);
  }
});

test("template dependencies and path alias support the kit", () => {
  const template = loadGoldenTemplate();
  const pkg = JSON.parse(templateFile(template, "package.json").content);
  for (const dep of [
    "@radix-ui/react-dialog",
    "@radix-ui/react-select",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-label",
    "@radix-ui/react-slot",
    "class-variance-authority",
    "clsx",
    "tailwind-merge",
    "lucide-react"
  ]) {
    assert.ok(pkg.dependencies[dep], `missing dependency ${dep}`);
  }
  const tsconfig = JSON.parse(templateFile(template, "tsconfig.json").content);
  assert.deepEqual(tsconfig.compilerOptions.paths["@/*"], ["./*"]);
});

test("starter page dogfoods the kit through the @ alias", () => {
  const template = loadGoldenTemplate();
  const page = templateFile(template, "app/page.tsx");
  assert.match(page.content, /@\/components\/ui\//);
});

test("build prompt steers the model to the prebuilt kit", () => {
  const prompt = buildSystemPrompt({
    template: { name: "nextjs-base", lockedFiles: [], files: [] },
    contextFiles: [],
    rollingSummary: null
  });
  assert.match(prompt, /components\/ui/);
  assert.match(prompt, /@\/components\/ui\/button/);
  assert.match(prompt, /lucide-react/);
});
